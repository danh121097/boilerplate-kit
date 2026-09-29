import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import { loginPathWithReturn, onSessionEnded, redirectOnSessionExpired } from "@/services/core";
import type { router as appRouter } from "@/router";

type SessionRouter = Pick<typeof appRouter, "navigate" | "state">;

/**
 * React to the end of the main session (wired once by the root layout):
 * - expired (the backend refused the refresh token, or rejected the session and
 *   it was revoked): send the user to /login, returning them to the current
 *   page after sign-in;
 * - logout from another tab: leave a protected page (route
 *   `staticData.requiresAuth`) for /login without a return path. This tab's own
 *   logout (`AuthModel.isLoggingOut()`) is skipped — the logout action
 *   navigates by itself. A revoke waiting for the session lock is not this
 *   tab's logout: when another tab logs out first, the revoke backs out and
 *   this listener leaves the protected page.
 * Other services' session end does not touch the main one. Never reloads the
 * page. Returns the unsubscribe.
 */
export function setupSessionExpiry(router: SessionRouter): () => void {
  const stopExpired = redirectOnSessionExpired(() => {
    const { pathname, href } = router.state.location;
    if (pathname !== "/login") void router.navigate({ href: loginPathWithReturn(href) });
  }, authContract.service);
  const stopLogout = onSessionEnded((reason, service) => {
    if (reason !== "logout" || service !== authContract.service) return;
    if (AuthModel.isLoggingOut()) return;
    if (router.state.matches.some((m) => m.staticData.requiresAuth)) {
      void router.navigate({ to: "/login" });
    }
  });
  return () => {
    stopExpired();
    stopLogout();
  };
}
