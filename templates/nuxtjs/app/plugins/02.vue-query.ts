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
 * a query prefetched during SSR (via `ensureQueryData`) renders with data on first
 * paint and is NOT refetched on hydration. This lets a server-side fetch flow through Vue Query and stay client-managed (invalidation).
 */
export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 60_000,
        placeholderData: keepPreviousData,
      },
    },
  });
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  const vueQueryState = useState<DehydratedState | null>("vue-query");

  if (import.meta.server) {
    nuxtApp.hooks.hook("app:rendered", () => {
      vueQueryState.value = dehydrate(queryClient);
    });
  }
  if (import.meta.client) {
    hydrate(queryClient, vueQueryState.value);
  }
});
