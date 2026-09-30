import type { QueryClient, QueryKey } from "@tanstack/vue-query";

/**
 * Optimistic cache edit: `update` runs for every cached query under `[queryKey]` (prefix match) that
 * holds data. Type `old` in your update (`update: (old: Board, vars) => …`).
 */
export interface OptimisticUpdate<TVars> {
  queryKey: string;
  update: (old: never, variables: TVars) => unknown;
}

/**
 * Context stored by a defined mutation: optimistic snapshots plus each layer's `onMutate` result.
 * Definition callbacks (`config.options`) receive `base`; override callbacks (hook args) receive `user`,
 * the override's own `onMutate` result, or `base` when the override declares no `onMutate`.
 */
export interface DefinedMutationContext<TCtx = unknown> {
  base: TCtx | undefined;
  snapshots: [QueryKey, unknown][];
  user: TCtx | undefined;
}

/** `mutation.meta` key listing the optimistic query-key prefixes a defined mutation edits. */
export const OPTIMISTIC_KEYS_META = "optimisticKeys";

/** Cancel in-flight fetches, snapshot the matching queries, then apply every update. */
export async function applyOptimistic<TVars>(
  client: QueryClient,
  updates: readonly OptimisticUpdate<TVars>[],
  variables: TVars,
): Promise<[QueryKey, unknown][]> {
  await Promise.all(updates.map((item) => client.cancelQueries({ queryKey: [item.queryKey] })));
  const snapshots = updates.flatMap((item) => client.getQueriesData({ queryKey: [item.queryKey] }));
  for (const item of updates) {
    client.setQueriesData({ queryKey: [item.queryKey] }, (old: unknown) =>
      old === undefined ? old : item.update(old as never, variables),
    );
  }
  return snapshots;
}

export function restoreSnapshots(client: QueryClient, snapshots: readonly [QueryKey, unknown][]) {
  for (const [queryKey, data] of snapshots) client.setQueryData(queryKey, data);
}

/**
 * Other in-flight mutations editing any of `optimisticKeys` — this definition or another one (TanStack
 * still counts the settling mutation itself as pending, hence `> 1`). A failing mutation restores its
 * snapshot, and invalidation runs, only when no sibling is pending: a snapshot taken before a sibling's
 * edit would erase it, and a refetch would overwrite it. The last one to settle reconciles the cache.
 */
export function othersPending(client: QueryClient, optimisticKeys: readonly string[]): boolean {
  const pending = client.isMutating({
    predicate: (mutation) => {
      const keys = mutation.meta?.[OPTIMISTIC_KEYS_META];
      return Array.isArray(keys) && keys.some((key) => optimisticKeys.includes(key as string));
    },
  });
  return pending > 1;
}
