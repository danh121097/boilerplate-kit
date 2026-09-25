"use client";

import { initI18n } from "@/i18n/i18n";
import { authContract } from "@/services/auth/contract";
import {
  makeQueryClient,
  resetQueriesOnSessionEnd,
  resyncQueriesAfterLogin,
} from "@/services/core/query-client";
import {
  loginPathWithReturn,
  redirectOnSessionExpired,
  syncAuthAcrossTabs,
} from "@/services/core/session";
import { initServices } from "@/services/init-services";
import { queryKeys } from "@/services/query-keys";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  /** Locale resolved on the server from the LANGUAGE cookie (root layout) so the
   * first client render matches SSR — no language flash. */
  initialLanguage?: string;
}

export function Providers({ children, initialLanguage }: ProvidersProps) {
  const router = useRouter();

  const [queryClient] = useState(() => getQueryClient());
  // Lazy init: one stable i18n instance across renders, seeded with the SSR locale.
  const [i18nInstance] = useState(() => initI18n(initialLanguage));

  // Logout / refused refresh of the auth service → reset the cache in place and
  // pin `auth.me` to null. Another service's session ending leaves it alone.
  useEffect(
    () => resetQueriesOnSessionEnd(queryClient, queryKeys.auth.me, authContract.service),
    [queryClient],
  );

  // Refused refresh (session expired) → send the user to /login, remembering
  // where they were (path, query and hash) so the login page can bring them
  // back. No reload.
  useEffect(
    () =>
      redirectOnSessionExpired(() => {
        const { pathname, search, hash } = window.location;
        if (pathname !== "/login") router.replace(loginPathWithReturn(pathname + search + hash));
      }, authContract.service),
    [router],
  );

  // Login/logout in another tab → re-render the Server Components (their server
  // reads depend on the auth cookies); a login also re-reads the session. On a
  // logout the session-end listener above has already reset every query to
  // signed-out; no route requires auth, so the page stays (no navigation).
  useEffect(
    () =>
      syncAuthAcrossTabs({
        onLogin: () => {
          resyncQueriesAfterLogin(queryClient, queryKeys.auth.me);
          router.refresh();
        },
        onLogout: () => router.refresh(),
      }),
    [queryClient, router],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}
