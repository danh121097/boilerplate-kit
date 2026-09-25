import {
  detectSessionHintChange,
  resetQueriesToSignedOut,
  resyncQueriesAfterLogin,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { QueryClient } from "@tanstack/vue-query";

/**
 * Keep this tab in step with logins / logouts made in other tabs. The auth
 * cookies are httpOnly and the readable session hint is a cookie too, so no
 * `storage` event announces them: the hint is re-read whenever the tab regains
 * focus or becomes visible (and on any `storage` event, e.g. another tab's
 * refresh bookkeeping).
 * - Hint gone (another tab logged out, or it expired): reset every query to
 *   signed-out in place — the layout flips to logged-out, mounted pages drop
 *   the old user's data.
 * - Hint appeared (another tab logged in): forget the signed-out user and mark
 *   every query stale, so the profile and page data refetch for the new session.
 */
export default defineNuxtPlugin((nuxtApp) => {
  // Explicit type: reading `$queryClient` through the inferred NuxtApp type
  // would be circular (`unknown`).
  const queryClient = nuxtApp.$queryClient as QueryClient;

  detectSessionHintChange(); // record the state this tab booted with

  const sync = () => {
    const change = detectSessionHintChange();
    if (change === "signed-out") resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
    else if (change === "signed-in") resyncQueriesAfterLogin(queryClient, queryKeys.auth.me);
  };

  window.addEventListener("focus", sync);
  window.addEventListener("storage", sync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
});
