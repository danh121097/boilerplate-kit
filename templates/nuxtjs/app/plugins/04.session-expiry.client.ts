import { authContract } from "@/services/auth";
import {
  loginPathWithReturn,
  redirectOnSessionExpired,
  resetQueriesOnSessionEnd,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { QueryClient } from "@tanstack/vue-query";

/**
 * React to the end of the main session. Logout and a refused refresh both reset
 * every query to signed-out in place (the hint is already cleared by
 * `endSession`). An expired session (the backend refused the refresh cookie)
 * also sends the user to /login with a `redirect` back to where they were;
 * a voluntary logout navigates on its own. Never a full page reload.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter();

  // Explicit type: this plugin is itself part of the inferred NuxtApp injection
  // type, so reading `$queryClient` through it would be circular (`unknown`).
  const queryClient = nuxtApp.$queryClient as QueryClient;

  resetQueriesOnSessionEnd(queryClient, queryKeys.auth.me, authContract.service);

  redirectOnSessionExpired(() => {
    const current = router.currentRoute.value;
    if (current.path === "/login") return;
    // Come back here after signing in again (`pages/login.vue` follows it).
    void nuxtApp.runWithContext(() => navigateTo(loginPathWithReturn(current.fullPath)));
  }, authContract.service);
});
