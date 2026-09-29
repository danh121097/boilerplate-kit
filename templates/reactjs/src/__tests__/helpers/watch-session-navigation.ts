import { loginPathWithReturn, onSessionEnded, redirectOnSessionExpired } from "@/services/core";
import { vi } from "vitest";

/** Where the root layout sends the user on each kind of session end, seen from
 * the page at `currentPath`: `expiredTo` gets the login path with a return path
 * on expiry, `reasons` every session end. */
export function watchNavigation(currentPath: string) {
  const expiredTo = vi.fn();
  const reasons = vi.fn();
  const offRedirect = redirectOnSessionExpired(() => expiredTo(loginPathWithReturn(currentPath)));
  const offEnded = onSessionEnded(reasons);
  return {
    expiredTo,
    reasons,
    stop: () => {
      offRedirect();
      offEnded();
    },
  };
}
