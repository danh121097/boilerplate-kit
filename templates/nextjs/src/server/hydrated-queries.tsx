import { getServerQueryClient } from "@/server/query-client";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";

interface PrefetchEntry {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
}

/**
 * Server-side prefetch + hydrate wrapper — the prefetch/dehydrate/HydrationBoundary
 * plumbing written ONCE. Prefetches the listed queries on the server (cookie
 * forwarded by the server fetchers), dehydrates the per-request cache, and wraps
 * children so matching client queries hydrate on first paint with no refetch.
 *
 * Each page only declares WHAT to prefetch (keys + server fetchers) — it cannot be
 * hoisted to the root because every route needs different data:
 *
 *   export const dynamic = "force-dynamic"; // server fetchers read auth cookies
 *   export default function UsersPage() {
 *     return (
 *       <HydratedQueries
 *         prefetch={[{ queryKey: [queryKeys.users.list], queryFn: () => getUsersServerData() }]}
 *       >
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
