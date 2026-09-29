import { isUnauthorizedError } from "@/services/core/api-errors";
import {
  defaultShouldDehydrateQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import type { ApiResponseError } from "@/services/core/types";
import type {
  MutationOptions,
  Query,
  UseMutationOptions,
  UseMutationReturnType,
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

interface UseQueryConfig<TData, TParams = void> extends QueryDefOpts<TData, TParams> {
  params?: MaybeRefOrGetter<TParams>;
}

interface DefineQueryConfig<TData, TParams = void> extends QueryDefOpts<TData, TParams> {
  key: string;
  fetcher: (params: TParams) => Promise<TData>;
}

export interface QueryDefinition<TData, TParams = void> {
  (config?: UseQueryConfig<TData, TParams>): UseQueryReturnType<TData, ApiResponseError>;
  key: string;
  queryKey: (params?: TParams) => QueryDefinitionKey<TParams>;
  /**
   * Plain `{ queryKey, queryFn }` for SSR prefetch: `await
   * useQueryClient().ensureQueryData(def.queryOptions())` in a page resolves the
   * query on the server (dehydrated → hydrated), so the same `useXxx()` hook
   * reads it without a refetch — Vue Query stays the single source + cache.
   */
  queryOptions: (params?: TParams) => {
    queryKey: QueryDefinitionKey<TParams>;
    queryFn: () => Promise<TData>;
  };
}

export function defineQuery<TData, TParams = void>(config: DefineQueryConfig<TData, TParams>) {
  const { fetcher, key, ...queryOptions } = config;

  const queryKey = (params?: TParams): QueryDefinitionKey<TParams> =>
    params !== undefined ? [key, params] : [key];

  const use = (useConfig?: UseQueryConfig<TData, TParams>) => {
    const { params, ...overrides } = useConfig ?? {};

    const reactiveQueryKey = computed(() => queryKey(toValue(params)));

    const options = {
      ...queryOptions,
      ...overrides,
      queryKey: reactiveQueryKey,
      queryFn: () => fetcher(toValue(params) as TParams),
    } as QueryOpt<TData, TParams>;
    return useQuery<TData, ApiResponseError, TData, QueryDefinitionKey<TParams>>(options);
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
 */
export function useServerRenderedQuery<TData, TParams = void>(
  definition: QueryDefinition<TData, TParams>,
  config?: UseQueryConfig<TData, TParams>,
) {
  const nuxtApp = useNuxtApp();

  const query = definition({ retryOnMount: !nuxtApp.isHydrating, ...config });
  onServerPrefetch(() => query.suspense());

  const leftForBrowser = computed(
    () => Boolean(nuxtApp.ssrContext) && isUnauthorizedError(query.error.value),
  );
  return {
    ...query,
    isLoading: computed(() => query.isLoading.value || leftForBrowser.value),
    error: computed(() => (leftForBrowser.value ? null : query.error.value)),
  };
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
  ): UseMutationReturnType<TData, ApiResponseError, TVars, TCtx>;
  key: string;
}

export function defineMutation<TData, TVars = void, TCtx = unknown>(
  config: DefineMutationConfig<TData, TVars, TCtx>,
) {
  const use = (overrides: MutationDefOpts<TData, TVars, TCtx> = {}) => {
    const queryClient = config.invalidates?.length ? useQueryClient() : undefined;
    const options = config.options;

    return useMutation<TData, ApiResponseError, TVars, TCtx>({
      ...options,
      ...overrides,
      mutationKey: [config.key],
      mutationFn: config.mutator,
      onSuccess: async (...args) => {
        if (queryClient && config.invalidates) {
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
