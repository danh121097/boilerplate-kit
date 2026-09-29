import { shouldDehydrateQuery } from "@/services/core";
import {
  dehydrate,
  hydrate,
  QueryClient,
  VueQueryPlugin,
  keepPreviousData,
} from "@tanstack/vue-query";
import type { DehydratedState } from "@tanstack/vue-query";

/**
 * Register TanStack Vue Query with SSR hydration. The server dehydrates the
 * QueryClient into the Nuxt payload after render; the client hydrates from it, so
 * a query resolved during SSR (via `useServerRenderedQuery`) renders with data on
 * first paint and is NOT refetched on hydration. A failed query is dehydrated as
 * its error unless it is a 401, which the browser runs again (it can refresh the
 * access cookie) — see `shouldDehydrateQuery`. This lets a server-side fetch flow
 * through Vue Query and stay client-managed (invalidation).
 */
export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: true,
        staleTime: 60_000,
        placeholderData: keepPreviousData,
      },
    },
  });
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  const vueQueryState = useState<DehydratedState | null>("vue-query");

  if (import.meta.server) {
    nuxtApp.hooks.hook("app:rendered", () => {
      vueQueryState.value = dehydrate(queryClient, { shouldDehydrateQuery });
    });
  }
  // Nothing to hydrate when the server produced no state (e.g. a client-only
  // navigation or an SSR error page) — `hydrate` rejects null in newer versions.
  if (import.meta.client && vueQueryState.value) {
    hydrate(queryClient, vueQueryState.value);
  }

  // Exposed as `useNuxtApp().$queryClient` for plugins that run outside a
  // component setup (e.g. clearing the cache on session expiry).
  return { provide: { queryClient } };
});
