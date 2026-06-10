import { routeTree } from "./routeTree.gen";
import { initI18n } from "@/i18n/i18n";
import { initServices } from "@/services";
import { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { I18nextProvider } from "react-i18next";

/** Router context shape — exposed to every route loader and component. */
export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Factory called by the TanStack Start Vite plugin's virtual module system.
 *
 * In the modern (Vite-based) TanStack Start API the plugin generates virtual
 * modules (#tanstack-router-entry, #tanstack-start-entry) that import this
 * file and call getRouter() on every request (SSR) or once on the client.
 *
 * A fresh QueryClient is created each call so SSR requests don't share state.
 * setupRouterSsrQueryIntegration dehydrates that client on the server and hydrates
 * it on the client, so a query prefetched in a route loader (ensureQueryData) is
 * read straight from the hydrated cache — no duplicate fetch on the client after
 * hydration. It also provides QueryClientProvider itself, so Wrap only adds i18n.
 *
 * A non-zero default staleTime keeps SSR-fetched data fresh past first paint;
 * with staleTime 0 the hydrated data would be stale-on-mount and refetch anyway,
 * defeating the prefetch. defaultPreloadStaleTime 0 keeps intent-preloads fresh.
 *
 * initServices() wires the axios client (baseURL + interceptors). It is invoked
 * client-side only — the service layer is browser-only, and SSR data is fetched
 * via server functions in `src/server/`. getRouter() runs once on the client, so
 * this registers the client exactly once before any route loader/query runs.
 */
export function getRouter() {
  // Wire the client-side axios service layer (baseURL + auth/refresh/HMAC
  // interceptors) once, before any route query fires. Client-only.
  if (typeof window !== "undefined") initServices();

  // Fresh QueryClient per call; on the browser Start caches the router so this
  // runs once; on the server it runs once per request.
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: true,
        placeholderData: keepPreviousData,
        // Hydrated SSR data must not be stale-on-mount, or the client refetches
        // immediately and the server prefetch is wasted.
        staleTime: 60_000,
      },
    },
  });

  // SSR-safe i18n: getSavedLanguage reads localStorage only when window is defined.
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

  // Dehydrate/hydrate the QueryClient across the SSR boundary + stream resolving
  // queries; also wraps the tree in QueryClientProvider (wrapQueryClient default).
  setupRouterSsrQueryIntegration({ router, queryClient: client });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
