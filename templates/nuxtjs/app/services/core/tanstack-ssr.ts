import { isUnauthorizedError } from "@/services/core/api-errors";
import { defaultShouldDehydrateQuery } from "@tanstack/vue-query";
import type { QueryDefinition, UseQueryConfig } from "@/services/core/tanstack";
import type { Query } from "@tanstack/vue-query";

/**
 * What the server ships to the browser in the Nuxt payload: successful queries,
 * and failures the browser could not fix either — so a page resolved with
 * `useServerRenderedQuery` renders the same error on both sides. A 401 is left
 * out: only the browser can refresh an expired access cookie, so it runs the
 * query again after hydration.
 */
export function shouldDehydrateQuery(query: Query): boolean {
  return (
    defaultShouldDehydrateQuery(query) ||
    (query.state.status === "error" && !isUnauthorizedError(query.state.error))
  );
}

/**
 * A page's query, resolved during SSR so the server renders its data or error
 * instead of the loading state (`useQuery` alone never waits on the server; the
 * fetch finishes after render and the client hydrates data the HTML lacks).
 * The server and the hydrating client render the same state:
 *
 * - success → both render the data (dehydrated, fresh, not refetched);
 * - a failure the browser cannot fix → both render the error: it is dehydrated
 *   (`shouldDehydrateQuery`) and not retried while hydrating. A later mount
 *   (client navigation) retries as usual;
 * - a 401 → both render loading: it is not dehydrated, and the browser fetches
 *   through the Model, which refreshes the access cookie.
 *
 * On the server a query is fetched at most once per request: a later reader of
 * a key that already failed (e.g. a page reading the session the layout
 * resolved) neither retries it on mount nor awaits a new fetch. A retry nobody
 * awaits would land in the payload after the HTML was rendered — a mismatch.
 */
export function useServerRenderedQuery<TData, TParams = void>(
  definition: QueryDefinition<TData, TParams>,
  config?: UseQueryConfig<TData, TParams>,
) {
  const nuxtApp = useNuxtApp();

  const onServer = Boolean(nuxtApp.ssrContext);

  const query = definition({ retryOnMount: !(onServer || nuxtApp.isHydrating), ...config });
  onServerPrefetch(async () => {
    if (!query.isError.value) await query.suspense();
  });

  const leftForBrowser = computed(() => onServer && isUnauthorizedError(query.error.value));
  return {
    ...query,
    isLoading: computed(() => query.isLoading.value || leftForBrowser.value),
    error: computed(() => (leftForBrowser.value ? null : query.error.value)),
  };
}
