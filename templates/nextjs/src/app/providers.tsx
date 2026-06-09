"use client";

import { initI18n } from "@/i18n/i18n";
import { initServices } from "@/services/init-services";
import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import type { ReactNode } from "react";

/**
 * App-wide client providers: React Query + i18n.
 *
 * Marked "use client" — this is the boundary where the client-side service
 * layer is initialized. initServices() wires baseURLs and interceptors;
 * initI18n() sets up i18next with the persisted locale. Both are SSR-safe
 * (localStorage guards ensure they only touch storage in the browser).
 */

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: true,
        placeholderData: keepPreviousData,
        // Avoid hydration mismatch: stale time 0 ensures server-prefetched
        // data is always considered fresh on the client after hydration.
        staleTime: 0,
      },
    },
  });
}

// Hold a single QueryClient across renders (not at module scope to avoid
// sharing state between server requests in SSR).
let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always create a new client so each request is isolated.
    return makeQueryClient();
  }
  // Browser: reuse the same client so data survives re-renders.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => getQueryClient());
  const initialized = useRef(false);
  // useState lazy initializer: i18n instance is created once and stable across renders,
  // so it's safe to pass directly to I18nextProvider without accessing a ref in render.
  const [i18nInstance] = useState(initI18n);

  useEffect(() => {
    if (!initialized.current) {
      initServices();
      initialized.current = true;
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}
