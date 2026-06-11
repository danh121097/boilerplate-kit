import { keepPreviousData, QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient factory — one config for the browser singleton (`providers`)
 * and the per-request server client used for SSR prefetch. `staleTime` keeps
 * server-prefetched data fresh through hydration, so a client query that was
 * prefetched on the server renders on first paint WITHOUT an immediate refetch.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: true,
        staleTime: 60_000,
        placeholderData: keepPreviousData,
      },
    },
  });
}
