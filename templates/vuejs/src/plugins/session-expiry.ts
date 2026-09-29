import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import { loginPathWithReturn, onSessionEnded, redirectOnSessionExpired } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import type { Pinia } from "pinia";
import type { Router } from "vue-router";

/**
 * React to the end of the main session:
 * - expired (the backend refused the refresh token, or rejected the session and
 *   it was revoked): send the user to /login, returning them to the current
 *   page after sign-in;
 * - another tab's logout: leave a protected page for /login without a return
 *   path. This tab's own logout navigates on its own and is skipped here.
 * The auth store is created first so its session-end listener has already
 * cleared the profile and query cache. Other services' session end does not
 * touch the main one. Never reloads the page.
 */
export function setupSessionExpiry(router: Router, pinia: Pinia) {
  useAuthStore(pinia);
  redirectOnSessionExpired(() => {
    const current = router.currentRoute.value;
    if (current.name === "login") return;
    void router.replace(loginPathWithReturn(current.fullPath));
  }, authContract.service);
  onSessionEnded((reason, service) => {
    if (reason !== "logout" || service !== authContract.service) return;
    // This tab's own logout navigates by itself; only another tab's logout is
    // handled here. A revoke waiting for the session lock does not count as
    // this tab's logout: when another tab logs out first, the revoke backs out
    // and this listener is the one that leaves the protected page.
    if (AuthModel.isLoggingOut()) return;
    if (router.currentRoute.value.meta.requiresAuth) void router.replace({ name: "login" });
  });
}
