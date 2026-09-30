import {
  applyOptimistic,
  OPTIMISTIC_KEYS_META,
  othersPending,
  restoreSnapshots,
} from "@/services/core/tanstack-optimistic";
import { useMutation } from "@tanstack/vue-query";
import type { DefinedMutationContext, OptimisticUpdate } from "@/services/core/tanstack-optimistic";
import type { ApiResponseError } from "@/services/core/types";
import type {
  MutationFunctionContext,
  MutationOptions,
  QueryClient,
  QueryKey,
  MutationObserverOptions,
  UseMutationReturnType,
} from "@tanstack/vue-query";

export type { DefinedMutationContext, OptimisticUpdate } from "@/services/core/tanstack-optimistic";
export { OPTIMISTIC_KEYS_META } from "@/services/core/tanstack-optimistic";

type MutationDefOpts<TData, TVars, TCtx = unknown> = Omit<
  MutationOptions<TData, ApiResponseError, TVars, TCtx>,
  "mutationKey" | "mutationFn"
>;

interface DefineMutationConfig<TData, TVars, TCtx = unknown> {
  key: string;
  mutator: (variables: TVars, context: MutationFunctionContext) => Promise<TData>;
  /**
   * Invalidated after success (after settling, when `optimistic` is set). A string is a key prefix
   * (`"users.list"` hits every param variant); a `QueryKey` array targets exactly that variant
   * (`["users.detail", { id }]`).
   */
  invalidates?: readonly (string | QueryKey)[];
  /** Opt-in optimistic edits, rolled back on error; see `OptimisticUpdate`. */
  optimistic?: OptimisticUpdate<TVars> | readonly OptimisticUpdate<TVars>[];
  options?: MutationDefOpts<TData, TVars, TCtx>;
}

export interface MutationDefinition<TData, TVars, TCtx = unknown> {
  (
    overrides?: MutationDefOpts<TData, TVars, TCtx>,
  ): UseMutationReturnType<TData, ApiResponseError, TVars, DefinedMutationContext<TCtx>>;
  key: string;
  /** Options the hook passes to `useMutation`, for `MutationObserver` / non-React callers and tests. */
  mutationOptions: (
    overrides?: MutationDefOpts<TData, TVars, TCtx>,
  ) => MutationObserverOptions<TData, ApiResponseError, TVars, DefinedMutationContext<TCtx>>;
}

/**
 * Lifecycle, in order: optimistic edits → definition `options` callback → hook `overrides` callback, for
 * all four hooks (`onMutate`, `onSuccess`, `onError`, `onSettled`). An override adds to the definition's
 * callbacks, it never replaces them. `invalidates` is awaited before the success callbacks (or, with
 * `optimistic`, before the settled callbacks once no sibling mutation is pending), so they see fresh cache.
 */
export function defineMutation<TData, TVars = void, TCtx = unknown>(
  config: DefineMutationConfig<TData, TVars, TCtx>,
) {
  const updates: readonly OptimisticUpdate<TVars>[] = config.optimistic
    ? ([] as OptimisticUpdate<TVars>[]).concat(config.optimistic)
    : [];
  const hasOptimistic = updates.length > 0;
  const optimisticKeys = updates.map((item) => item.queryKey);

  async function invalidate(client: QueryClient) {
    await Promise.all(
      (config.invalidates ?? []).map((key) =>
        client.invalidateQueries({ queryKey: typeof key === "string" ? [key] : key }),
      ),
    );
  }

  function buildMutationOptions(
    overrides: MutationDefOpts<TData, TVars, TCtx> = {},
  ): MutationObserverOptions<TData, ApiResponseError, TVars, DefinedMutationContext<TCtx>> {
    const base = config.options ?? {};

    // The four callbacks below replace the spread ones and call both layers themselves.
    const rest = { ...base, ...overrides };

    return {
      ...rest,
      meta: hasOptimistic ? { ...rest.meta, [OPTIMISTIC_KEYS_META]: optimisticKeys } : rest.meta,
      mutationKey: [config.key],
      mutationFn: config.mutator,
      onMutate: async (variables, context) => {
        const snapshots = hasOptimistic
          ? await applyOptimistic(context.client, updates, variables)
          : [];
        try {
          const baseContext = await base.onMutate?.(variables, context);
          const overrideContext = await overrides.onMutate?.(variables, context);
          return {
            base: baseContext,
            snapshots,
            user: overrides.onMutate ? overrideContext : baseContext,
          };
        } catch (error) {
          restoreSnapshots(context.client, snapshots);
          throw error;
        }
      },
      onSuccess: async (data, variables, result, context) => {
        if (!hasOptimistic) await invalidate(context.client);
        await base.onSuccess?.(data, variables, result?.base as TCtx, context);
        await overrides.onSuccess?.(data, variables, result?.user as TCtx, context);
      },
      onError: async (error, variables, result, context) => {
        if (!othersPending(context.client, optimisticKeys)) {
          restoreSnapshots(context.client, result?.snapshots ?? []);
        }
        await base.onError?.(error, variables, result?.base, context);
        await overrides.onError?.(error, variables, result?.user, context);
      },
      onSettled: async (data, error, variables, result, context) => {
        if (hasOptimistic && !othersPending(context.client, optimisticKeys)) {
          await invalidate(context.client);
        }
        await base.onSettled?.(data, error, variables, result?.base, context);
        await overrides.onSettled?.(data, error, variables, result?.user, context);
      },
    };
  }

  function useDefinedMutation(overrides: MutationDefOpts<TData, TVars, TCtx> = {}) {
    return useMutation(buildMutationOptions(overrides));
  }

  const definition = useDefinedMutation as MutationDefinition<TData, TVars, TCtx>;
  definition.key = config.key;
  definition.mutationOptions = buildMutationOptions;
  return definition;
}
