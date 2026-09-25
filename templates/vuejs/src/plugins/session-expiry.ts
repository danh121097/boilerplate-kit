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
 * - logout (a voluntary one here, or another tab's): leave a protected page for
 *   /login without a return path. The voluntary one also navigates on its own.
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
    if (router.currentRoute.value.meta.requiresAuth) void router.replace({ name: "login" });
  });
}
