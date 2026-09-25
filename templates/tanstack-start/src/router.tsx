import { initI18n } from "@/i18n/i18n";
import { routeTree } from "@/routeTree.gen";
import { initServices } from "@/services";
import {
  makeQueryClient,
  resetQueriesOnSessionEnd,
  resyncQueriesAfterLogin,
} from "@/services/core/query-client";
import { redirectOnSessionExpired, syncAuthAcrossTabs } from "@/services/core/session";
import { queryKeys } from "@/services/query-keys";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { I18nextProvider } from "react-i18next";
import type { QueryClient } from "@tanstack/react-query";

/** Router context shape — exposed to every route loader and component. */
export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Router factory — the TanStack Start Vite plugin calls this per SSR request and
 * once on the client. A fresh QueryClient per call keeps SSR requests isolated;
 * setupRouterSsrQueryIntegration dehydrates it on the server + hydrates on the
 * client (and provides QueryClientProvider, so Wrap only adds i18n), letting a
 * loader-prefetched query render without a duplicate client fetch.
 */
export function getRouter() {
  // Client-only: wire the axios service layer (baseURL + interceptors) once.
  if (typeof window !== "undefined") initServices();

  // Shared defaults (non-zero staleTime so hydrated SSR data isn't refetched on mount).
  const client = makeQueryClient();

  // Browser: logout / failed refresh resets the cache in place and pins `auth.me` to null.
  if (typeof window !== "undefined") resetQueriesOnSessionEnd(client, queryKeys.auth.me);

  const i18n = initI18n();

  const router = createRouter({
    routeTree,
    context: { queryClient: client },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // QueryClientProvider is supplied by setupRouterSsrQueryIntegration below;
    // Wrap (runs every render) only adds the per-request i18n instance.
    Wrap: ({ children }: { children: React.ReactNode }) => (
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    ),
  });

  if (typeof window !== "undefined") {
    // A refused refresh (session expired) routes to /login, carrying the current
    // path so the login page can bring the user back. No reload.
    redirectOnSessionExpired(() => {
      const { pathname, href } = router.state.location;
      if (pathname !== "/login") void router.navigate({ to: "/login", search: { redirect: href } });
    });

    // Login/logout in another tab → re-read the session and re-run the route
    // loaders here. A remote logout has already cleared this tab's cache via the
    // session-end listener.
    syncAuthAcrossTabs({
      onLogin: () => {
        resyncQueriesAfterLogin(client, queryKeys.auth.me);
        void router.invalidate();
      },
      onLogout: () => void router.invalidate(),
    });
  }

  // Dehydrate/hydrate the QueryClient across the SSR boundary + supply QueryClientProvider.
  setupRouterSsrQueryIntegration({ router, queryClient: client });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
