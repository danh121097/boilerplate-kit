import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";

/** Any query definition; `never` params accept a definition of any params type. */
interface Prefetchable {
  queryOptions: (params?: never) => object;
}

/** A query definition, or `[definition, params]` for one that takes params. */
type PrefetchEntry = Prefetchable | readonly [Prefetchable, unknown];

function toQueryOptions(entry: PrefetchEntry) {
  const [def, params] = "queryOptions" in entry ? [entry, undefined] : entry;
  return def.queryOptions(params as never) as FetchQueryOptions;
}

/**
 * Build a route `loader` that prefetches query definitions into the router's QueryClient. The router's
 * SSR-query integration (set up once in `router.tsx`) dehydrates them, so the matching hook hydrates with
 * no refetch. Pass `[definition, params]` for a query that takes params:
 *
 *   loader: prefetchQueries(useMeQuery, [useUserQuery, { id }]),
 *
 * Uses `prefetchQuery` (never throws): a failed prefetch — e.g. an expired session deferred to the
 * browser — must not fail the route. The query is left in an error state without data, so the component's
 * hook refetches on mount. Use `ensureQueries` when the route cannot render without the data.
 */
export function prefetchQueries(...entries: PrefetchEntry[]) {
  return async ({ context }: { context: { queryClient: QueryClient } }): Promise<void> => {
    await Promise.all(
      entries.map((entry) => context.queryClient.prefetchQuery(toQueryOptions(entry))),
    );
  };
}

/**
 * Like `prefetchQueries`, but uses `ensureQueryData`: cached data (still fresh or not) is reused, and a
 * failed fetch rejects, so the route's `errorComponent` / `notFoundComponent` can take over.
 */
export function ensureQueries(...entries: PrefetchEntry[]) {
  return async ({ context }: { context: { queryClient: QueryClient } }): Promise<void> => {
    await Promise.all(
      entries.map((entry) => context.queryClient.ensureQueryData(toQueryOptions(entry))),
    );
  };
}
