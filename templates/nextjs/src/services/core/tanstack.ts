import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponseError } from "@/services/core/types";
import type { MutationOptions, UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";

type QueryDefinitionKey<TParams> = readonly [string] | readonly [string, TParams];

type QueryDefOpts<TData, TParams = void> = Omit<
  UseQueryOptions<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>,
  "queryKey" | "queryFn"
>;

/** A plain queryKey + queryFn object, consumable by ensureQueryData / prefetchQuery. */
export interface QueryOptionsObject<TData, TParams = void> {
  queryKey: QueryDefinitionKey<TParams>;
  queryFn: () => Promise<TData>;
}

interface UseQueryConfig<TData, TParams = void> extends QueryDefOpts<TData, TParams> {
  params?: TParams;
}

interface DefineQueryConfig<TData, TParams = void> extends QueryDefOpts<TData, TParams> {
  key: string;
  fetcher: (params: TParams) => Promise<TData>;
}

export interface QueryDefinition<TData, TParams = void> {
  (
    config?: UseQueryConfig<TData, TParams>,
  ): ReturnType<typeof useQuery<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>>;
  key: string;
  queryKey: (params?: TParams) => QueryDefinitionKey<TParams>;
  /** Same key + fetcher as the hook, as a plain object, for `prefetchQuery` /
   * `ensureQueryData`. Fetchers are browser-only (axios + cookie hint), so call it
   * from client code; server prefetch goes through `server/hydrated-queries.tsx`. */
  queryOptions: (params?: TParams) => QueryOptionsObject<TData, TParams>;
}

export function defineQuery<TData, TParams = void>(config: DefineQueryConfig<TData, TParams>) {
  const { key, fetcher, ...queryOptions } = config;

  const queryKey = (params?: TParams): QueryDefinitionKey<TParams> =>
    params !== undefined ? [key, params] : [key];

  const use = (useConfig?: UseQueryConfig<TData, TParams>) => {
    const { params, ...overrides } = useConfig ?? {};
    return useQuery<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>({
      ...queryOptions,
      ...overrides,
      queryKey: queryKey(params),
      queryFn: () => fetcher(params as TParams),
    });
  };

  const definition = use as QueryDefinition<TData, TParams>;
  definition.key = key;
  definition.queryKey = queryKey;
  definition.queryOptions = (params?: TParams) => ({
    queryKey: queryKey(params),
    queryFn: () => fetcher(params as TParams),
  });
  return definition;
}

type MutationDefOpts<TData, TVars, TCtx = unknown> = Omit<
  MutationOptions<TData, ApiResponseError, TVars, TCtx>,
  "mutationKey" | "mutationFn"
>;

interface DefineMutationConfig<TData, TVars, TCtx = unknown> {
  key: string;
  mutator: (variables: TVars) => Promise<TData>;
  invalidates?: string[];
  options?: MutationDefOpts<TData, TVars, TCtx>;
}

export interface MutationDefinition<TData, TVars, TCtx = unknown> {
  (
    overrides?: MutationDefOpts<TData, TVars, TCtx>,
  ): ReturnType<typeof useMutation<TData, ApiResponseError, TVars, TCtx>>;
  key: string;
}

export function defineMutation<TData, TVars = void, TCtx = unknown>(
  config: DefineMutationConfig<TData, TVars, TCtx>,
) {
  const use = (overrides: MutationDefOpts<TData, TVars, TCtx> = {}) => {
    // useQueryClient must only be called when invalidates is non-empty — hooks
    // must be called unconditionally, so we call it and guard usage below.
    const queryClient = useQueryClient();
    const options = config.options;

    return useMutation<TData, ApiResponseError, TVars, TCtx>({
      ...options,
      ...overrides,
      mutationKey: [config.key],
      mutationFn: config.mutator,
      onSuccess: async (...args) => {
        if (config.invalidates?.length) {
          await Promise.all(
            config.invalidates.map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
          );
        }
        await options?.onSuccess?.(...args);
        await overrides.onSuccess?.(...args);
      },
    } satisfies UseMutationOptions<TData, ApiResponseError, TVars, TCtx>);
  };

  const definition = use as MutationDefinition<TData, TVars, TCtx>;
  definition.key = config.key;
  return definition;
}
