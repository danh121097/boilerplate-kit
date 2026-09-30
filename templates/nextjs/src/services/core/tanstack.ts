import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ApiResponseError } from "@/services/core/types";
import type { UndefinedInitialDataOptions, UseQueryOptions } from "@tanstack/react-query";

type QueryDefinitionKey<TParams> = readonly [string] | readonly [string, TParams];

type QueryDefOpts<TData, TParams = void> = Omit<
  UseQueryOptions<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>,
  "queryKey" | "queryFn"
>;

interface UseQueryConfig<TData, TParams = void> extends QueryDefOpts<TData, TParams> {
  params?: TParams;
}

/** Per-call context handed to a query fetcher (TanStack's abort signal). */
export interface QueryFetcherContext {
  signal: AbortSignal;
}

/**
 * Hand the fetcher a lazy `signal`. TanStack treats reading `signal` as opting into cancellation: the
 * query is cancelled and refetched when its last observer unmounts (a StrictMode remount, a fast
 * route change). Only a fetcher that actually uses the signal should pay for that.
 */
function fetcherContext(context: QueryFetcherContext): QueryFetcherContext {
  return {
    get signal() {
      return context.signal;
    },
  };
}

interface DefineQueryConfig<TData, TParams = void> extends QueryDefOpts<TData, TParams> {
  key: string;
  fetcher: (params: TParams, context: QueryFetcherContext) => Promise<TData>;
}

export interface QueryDefinition<TData, TParams = void> {
  (
    config?: UseQueryConfig<TData, TParams>,
  ): ReturnType<typeof useQuery<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>>;
  key: string;
  queryKey: (params?: TParams) => QueryDefinitionKey<TParams>;
  /**
   * Same key, fetcher and definition-level options (`staleTime`, `select`, …) as the hook, so a route
   * loader (`prefetchQueries` / `ensureQueryData`) and the component share one query.
   */
  queryOptions: (
    params?: TParams,
  ) => UseQueryOptions<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>;
}

/**
 * Declare one query: `key` is the prefix (`["users.list"]` invalidates every param variant),
 * params extend it (`["users.detail", { id }]`).
 */
export function defineQuery<TData, TParams = void>(config: DefineQueryConfig<TData, TParams>) {
  const { key, fetcher, ...defaults } = config;

  function queryKey(params?: TParams): QueryDefinitionKey<TParams> {
    return params !== undefined ? [key, params] : [key];
  }

  function buildQueryOptions(params?: TParams) {
    return queryOptions<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>({
      ...defaults,
      queryKey: queryKey(params),
      queryFn: (context) => fetcher(params as TParams, fetcherContext(context)),
    } as UndefinedInitialDataOptions<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>);
  }

  function useDefinedQuery(useConfig?: UseQueryConfig<TData, TParams>) {
    const { params, ...overrides } = useConfig ?? {};
    return useQuery<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>({
      ...buildQueryOptions(params),
      ...overrides,
    });
  }

  const definition = useDefinedQuery as QueryDefinition<TData, TParams>;
  definition.key = key;
  definition.queryKey = queryKey;
  definition.queryOptions = buildQueryOptions;
  return definition;
}
