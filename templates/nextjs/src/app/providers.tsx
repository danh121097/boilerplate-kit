"use client";

import { initI18n } from "@/i18n/i18n";
import { makeQueryClient } from "@/services/core/query-client";
import { initServices } from "@/services/init-services";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * App-wide client providers: React Query + i18n.
 *
 * Marked "use client" — this is the boundary where the client-side service
 * layer is initialized. initServices() wires baseURLs + interceptors (cookie-based
 * auth, no token storage); initI18n() sets up i18next with the persisted locale.
 */

// Register the client service layer (axios baseURL + HMAC/refresh interceptors)
// once at module load — BEFORE any component renders or query runs. A useEffect
// fires after child effects, so the first query (e.g. a hard reload of /users)
// would request without HMAC → 401. Client-only; the server uses serverApiGet.
if (typeof window !== "undefined") initServices();

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
  // Lazy init: one stable i18n instance across renders.
  const [i18nInstance] = useState(initI18n);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}
