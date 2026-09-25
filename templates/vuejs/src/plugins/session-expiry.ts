import { authContract } from "@/services/auth/contract";
import { onSessionExpired } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import type { Pinia } from "pinia";
import type { Router } from "vue-router";

/**
 * React to a definitively expired session (the backend refused the refresh
 * token): clear the auth store, tokens and query cache, then send the user to
 * /login — returning them to the current page after sign-in. Replaces the old
 * full-page reload. Other services' expiry does not end the main session.
 */
export function setupSessionExpiry(router: Router, pinia: Pinia) {
  onSessionExpired((service) => {
    if (service !== authContract.service) return;
    useAuthStore(pinia).clearSession();

    const current = router.currentRoute.value;
    if (current.name === "login") return;
    void router.replace({ name: "login", query: { redirect: current.fullPath } });
  });
}
