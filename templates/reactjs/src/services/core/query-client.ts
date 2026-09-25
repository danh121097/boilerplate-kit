import { onSessionEnded } from "@/services/core/session";
import type { ApiService } from "@/services/core/types";
import type { QueryClient } from "@tanstack/react-query";

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

/** Logout / refused refresh of `service` (the auth service) →
 * `resetQueriesToSignedOut`. Another service's session end leaves the cache
 * alone. Returns the unsubscribe (use as an effect cleanup). */
export function resetQueriesOnSessionEnd(
  queryClient: QueryClient,
  sessionKey: string,
  service: ApiService = "MAIN",
): () => void {
  return onSessionEnded((_reason, ended) => {
    if (ended === service) resetQueriesToSignedOut(queryClient, sessionKey);
  });
}

/**
 * Another tab signed in: forget the signed-out user and mark every cached query
 * stale, so the profile and signed-in data refetch under the new session.
 */
export function resyncQueriesAfterLogin(queryClient: QueryClient, sessionKey: string): void {
  void queryClient.resetQueries({ queryKey: [sessionKey] });
  void queryClient.invalidateQueries();
}
