import { safeRedirect } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import type { RouteLocationNormalized, RouteLocationRaw } from "vue-router";

/**
 * Auth guard. `isAuthenticated` reads the persisted token synchronously, so the
 * decision is made without waiting on the profile fetch (`hydrate` runs in App).
 * Guests hitting a protected route go to /login with a return path; a signed-in
 * user hitting /login goes to that return path (same-origin only), else home.
 */
export function authGuard(to: RouteLocationNormalized): RouteLocationRaw | undefined {
  const { isAuthenticated } = useAuthStore();

  if (to.meta.requiresAuth && !isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && isAuthenticated) {
    return safeRedirect(to.query.redirect);
  }
  return undefined;
}
