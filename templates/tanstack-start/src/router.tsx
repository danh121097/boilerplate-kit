import { routeTree } from "./routeTree.gen";
import { initI18n } from "@/i18n/i18n";
import { initServices } from "@/services";
import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
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
 * Providers are in Wrap so they survive the full render tree without leaking
 * across requests.
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
    // Providers must be in Wrap (runs on every render) rather than as static
    // module-level singletons so each SSR request gets its own instances.
    Wrap: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </QueryClientProvider>
    ),
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
