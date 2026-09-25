import { authContract } from "@/services/auth/contract";
import { loginPathWithReturn, redirectOnSessionExpired } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import type { Pinia } from "pinia";
import type { Router } from "vue-router";

/**
 * React to an expired main session (the backend refused the refresh token):
 * send the user to /login, returning them to the current page after sign-in.
 * The auth store is created first so its session-end listener has already
 * cleared the profile and query cache. Other services' expiry does not end the
 * main session. Never reloads the page.
 */
export function setupSessionExpiry(router: Router, pinia: Pinia) {
  useAuthStore(pinia);
  redirectOnSessionExpired(() => {
    const current = router.currentRoute.value;
    if (current.name === "login") return;
    void router.replace(loginPathWithReturn(current.fullPath));
  }, authContract.service);
}
