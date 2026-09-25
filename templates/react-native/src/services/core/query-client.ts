import { onSessionEnded } from "@/services/core/session";
import type { ApiService } from "@/services/core/types";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Drop every signed-in query without detaching mounted components. Each query
 * is reset in place (in-flight fetch cancelled, data gone, observers notified,
 * nothing refetched); queries nobody observes are then removed. The session
 * query is pinned to "signed out" (`null`), so a mounted reader shows
 * signed-out and a later login's invalidation reaches the same observer.
 *
 * Not `queryClient.clear()`: that removes the Query objects mounted observers
 * are subscribed to, so they keep showing the old user's data and never see
 * the `null` pin or the next login's refetch.
 */
export function resetQueriesToSignedOut(queryClient: QueryClient, sessionKey: string): void {
  const cache = queryClient.getQueryCache();
  for (const query of cache.getAll()) {
    query.reset();
    if (query.getObserversCount() === 0) cache.remove(query);
  }
  queryClient.setQueryData([sessionKey], null);
}

/** Reset every query to signed-out whenever `service`'s session ends (logout or
 * expiry). Other services' session ends leave the cache alone. Returns the
 * unsubscribe. */
export function resetQueriesOnSessionEnd(
  queryClient: QueryClient,
  sessionKey: string,
  service: ApiService = "MAIN",
): () => void {
  return onSessionEnded((_reason, ended) => {
    if (ended === service) resetQueriesToSignedOut(queryClient, sessionKey);
  });
}
