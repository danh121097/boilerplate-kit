import { isServerRender } from "@/services/core/render-env";
import { useQuery } from "@tanstack/vue-query";
import type { ApiResponseError } from "@/services/core/types";
import type {
  QueryObserverOptions,
  UseQueryOptions,
  UseQueryReturnType,
} from "@tanstack/vue-query";
import type { MaybeRefOrGetter, Ref } from "vue";

type QueryDefinitionKey<TParams> = readonly [string] | readonly [string, TParams];
type UnwrapMaybeRef<T> = T extends Ref<infer V> ? V : T;
type QueryOpt<TData, TParams = void> = UseQueryOptions<
  TData,
  ApiResponseError,
  TData,
  TData,
  QueryDefinitionKey<TParams>
>;
type QueryDefOpts<TData, TParams = void> = Omit<
  UnwrapMaybeRef<QueryOpt<TData, TParams>>,
  "queryKey" | "queryFn"
>;

export interface UseQueryConfig<TData, TParams = void> extends QueryDefOpts<TData, TParams> {
  params?: MaybeRefOrGetter<TParams>;
}

/** Per-call context handed to a query fetcher (TanStack's abort signal). */
export interface QueryFetcherContext {
  signal: AbortSignal;
}

type QueryFetcher<TData, TParams> = (
  params: TParams,
  context: QueryFetcherContext,
) => Promise<TData>;

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
  /** Browser read (axios Model: refreshes-and-retries on 401). */
  fetcher: QueryFetcher<TData, TParams>;
  /**
   * SSR read (`serverApiGet` & co. with the forwarded cookie; never refreshes). Used instead of `fetcher`
   * while `isServerRender` (Nuxt only; the SPA never uses it); omitted, `fetcher` runs on both sides.
   * Must resolve to the same `TData`, so the dehydrated cache matches what the browser would fetch.
   */
  serverFetcher?: QueryFetcher<TData, TParams>;
}

/** Plain (unref'd) query options: key, fetcher and the definition's own options (`staleTime`, …). */
export type DefinedQueryOptions<TData, TParams = void> = QueryObserverOptions<
  TData,
  ApiResponseError,
  TData,
  TData,
  QueryDefinitionKey<TParams>
>;

export interface QueryDefinition<TData, TParams = void> {
  (config?: UseQueryConfig<TData, TParams>): UseQueryReturnType<TData, ApiResponseError>;
  key: string;
  queryKey: (params?: TParams) => QueryDefinitionKey<TParams>;
  /** Same key, fetcher and definition-level options as the hook, for `ensureQueryData` / prefetch. */
  queryOptions: (params?: TParams) => DefinedQueryOptions<TData, TParams>;
}

/**
 * Declare one query: `key` is the prefix (`["users.list"]` invalidates every param variant),
 * params extend it (`["users.detail", { id }]`). `params` may be a ref or getter; the key follows it.
 * Nuxt: a page resolves it during SSR with `useServerRenderedQuery` (`tanstack-ssr.ts`).
 */
export function defineQuery<TData, TParams = void>(config: DefineQueryConfig<TData, TParams>) {
  const { fetcher: clientFetcher, key, serverFetcher, ...defaults } = config;

  const fetcher: QueryFetcher<TData, TParams> = (params, context) =>
    isServerRender && serverFetcher
      ? serverFetcher(params, context)
      : clientFetcher(params, context);

  function queryKey(params?: TParams): QueryDefinitionKey<TParams> {
    return params !== undefined ? [key, params] : [key];
  }

  function buildQueryOptions(params?: TParams): DefinedQueryOptions<TData, TParams> {
    return {
      ...(defaults as DefinedQueryOptions<TData, TParams>),
      queryKey: queryKey(params),
      queryFn: (context) => fetcher(params as TParams, fetcherContext(context)),
    };
  }

  function useDefinedQuery(useConfig?: UseQueryConfig<TData, TParams>) {
    const { params, ...overrides } = useConfig ?? {};
    const options = {
      ...defaults,
      ...overrides,
      queryKey: computed(() => queryKey(toValue(params))),
      queryFn: (context: QueryFetcherContext) =>
        fetcher(toValue(params) as TParams, fetcherContext(context)),
    } as QueryOpt<TData, TParams>;
    return useQuery<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>(options);
  }

  const definition = useDefinedQuery as QueryDefinition<TData, TParams>;
  definition.key = key;
  definition.queryKey = queryKey;
  definition.queryOptions = buildQueryOptions;
  return definition;
}
