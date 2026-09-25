import { authContract, useSessionQuery } from "@/services/auth";
import {
  clearSessionHint,
  hasSessionHint,
  onSessionExpired,
  resetQueriesToSignedOut,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { QueryClient } from "@tanstack/vue-query";

/**
 * React to a definitively expired session (the backend refused the refresh
 * cookie, or a refreshed request is still 401): clear the query cache and send
 * the user to /login. Replaces the old full-page reload.
 *
 * Only acts when a session existed: a user is cached, or the readable session
 * hint is set (a cold page load with an expired access cookie and a dead
 * refresh cookie has nothing cached yet). An anonymous visitor has neither — and
 * without the hint its 401s never even attempt a refresh.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter();

  // Explicit type: this plugin is itself part of the inferred NuxtApp injection
  // type, so reading `$queryClient` through it would be circular (`unknown`).
  const queryClient = nuxtApp.$queryClient as QueryClient;

  onSessionExpired((service) => {
    if (service !== authContract.service) return;
    const hadSession =
      hasSessionHint() || Boolean(queryClient.getQueryData(useSessionQuery.queryKey()));
    if (!hadSession) return;

    clearSessionHint();
    resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
    const current = router.currentRoute.value;
    if (current.path === "/login") return;
    // Come back here after signing in again (`pages/login.vue` follows it).
    void nuxtApp.runWithContext(() =>
      navigateTo({ path: "/login", query: { redirect: current.fullPath } }),
    );
  });
});
