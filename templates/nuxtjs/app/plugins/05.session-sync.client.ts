import { resyncQueriesAfterLogin, syncAuthAcrossTabs } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { QueryClient } from "@tanstack/vue-query";

/**
 * Keep this tab in step with logins / logouts made in other tabs (see
 * `syncAuthAcrossTabs`: the `AUTH_SYNC` storage event, plus a session hint
 * re-read on focus / visibility).
 * - Another tab logged out (or the hint expired): the local session ends as a
 *   logout, so `04.session-expiry.client.ts` resets every query to signed-out
 *   in place — the layout flips to logged-out, mounted pages drop the old
 *   user's data.
 * - Another tab logged in: forget the signed-out user and mark every query
 *   stale, so the profile and page data refetch for the new session.
 */
export default defineNuxtPlugin((nuxtApp) => {
  // Explicit type: reading `$queryClient` through the inferred NuxtApp type
  // would be circular (`unknown`).
  const queryClient = nuxtApp.$queryClient as QueryClient;

  syncAuthAcrossTabs({
    onLogin: () => resyncQueriesAfterLogin(queryClient, queryKeys.auth.me),
  });
});
