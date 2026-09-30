import { getServerQueryClient } from "@/server/query-client";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { QueryDefinition } from "@/services/core";
import type { QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";

interface PrefetchEntry {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
}

/**
 * Pair a query definition with its server fetcher ONCE per resource (in `src/server/queries/`), so pages
 * only pick what to prefetch. The key comes from the definition (`queryKey(params)`) and the fetcher must
 * resolve to the same `TData`: key drift would silently refetch on mount, shape drift fails typecheck.
 *
 *   export const usersListServer = serverQuery(useUsersListQuery, getUsersServerData);
 *   <HydratedQueries prefetch={[usersListServer()]}>
 *
 * The client component must call the hook with the SAME params the page prefetched (pass them down as
 * props), or its key differs and it fetches again.
 */
export function serverQuery<TData, TParams = void>(
  definition: QueryDefinition<TData, TParams>,
  fetcher: (params: TParams) => Promise<TData>,
) {
  return (params?: TParams): PrefetchEntry => ({
    queryKey: definition.queryKey(params),
    queryFn: () => fetcher(params as TParams),
  });
}

/**
 * Server-side prefetch + hydrate wrapper — the prefetch/dehydrate/HydrationBoundary
 * plumbing written ONCE. Prefetches the listed queries on the server (cookie
 * forwarded by the server fetchers), dehydrates the per-request cache, and wraps
 * children so matching client queries hydrate on first paint with no refetch.
 *
 * A fetcher that throws (e.g. the access cookie expired) is NOT dehydrated
 * (`prefetchQuery` swallows the error; default dehydration skips failed
 * queries), so the client query simply fetches on mount through axios — which
 * refreshes the session — instead of hydrating a stale empty result.
 *
 * Each page only declares WHAT to prefetch (paired queries from `src/server/queries/`) — it cannot be
 * hoisted to the root because every route needs different data:
 *
 *   export const dynamic = "force-dynamic"; // server fetchers read auth cookies
 *   export default function UsersPage() {
 *     return (
 *       <HydratedQueries prefetch={[usersListServer()]}>
 *         <UsersListClient />
 *       </HydratedQueries>
 *     );
 *   }
 */
export async function HydratedQueries({
  prefetch,
  children,
}: {
  prefetch: PrefetchEntry[];
  children: ReactNode;
}) {
  const queryClient = getServerQueryClient();
  await Promise.all(prefetch.map((entry) => queryClient.prefetchQuery(entry)));
  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
