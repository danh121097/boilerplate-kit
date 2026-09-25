import { onSessionEnded } from "@/services/core/session";
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

/**
 * Drop every signed-in query without detaching mounted components. Each query
 * is reset in place (in-flight fetch cancelled, data gone, observers notified,
 * nothing refetched); queries nobody observes are then removed. The session
 * query is pinned to "signed out" (`null`), so a mounted header re-renders
 * signed-out and a later login's invalidation reaches the same observer.
 *
 * Not `queryClient.clear()`: that removes the Query objects mounted observers
 * are subscribed to, so they keep showing the old user and never see the
 * `null` pin or the next login's refetch.
 */
export function resetQueriesToSignedOut(queryClient: QueryClient, sessionKey: string): void {
  const cache = queryClient.getQueryCache();
  for (const query of cache.getAll()) {
    query.reset();
    if (query.getObserversCount() === 0) cache.remove(query);
  }
  queryClient.setQueryData([sessionKey], null);
}

/** Logout / failed refresh → `resetQueriesToSignedOut`. Returns the unsubscribe
 * (use as an effect cleanup). */
export function resetQueriesOnSessionEnd(queryClient: QueryClient, sessionKey: string): () => void {
  return onSessionEnded(() => resetQueriesToSignedOut(queryClient, sessionKey));
}

/**
 * Another tab signed in: forget the signed-out user and mark every cached query
 * stale, so the profile and signed-in data refetch under the new session.
 */
export function resyncQueriesAfterLogin(queryClient: QueryClient, sessionKey: string): void {
  void queryClient.resetQueries({ queryKey: [sessionKey] });
  void queryClient.invalidateQueries();
}
