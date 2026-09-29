import { onSessionEnded } from "@/services/core";
import { setupSessionExpiry } from "@/services/session-expiry";
import { onTestFinished, vi } from "vitest";

type SessionExpiryRouter = Parameters<typeof setupSessionExpiry>[0];

/** Where the app's real session-expiry wiring sends the user on each kind of
 * session end, seen from the page at `currentPath` (a fake router records the
 * navigation): `expiredTo` gets the login href with a return path on expiry,
 * `reasons` every session end. Listeners are removed when the test finishes. */
export function watchNavigation(currentPath: string) {
  const expiredTo = vi.fn();
  const reasons = vi.fn();
  const router = {
    navigate: ({ href }: { href?: string }) => expiredTo(href),
    state: {
      location: { pathname: currentPath.split(/[?#]/)[0], href: currentPath },
      matches: [],
    },
  } as unknown as SessionExpiryRouter;
  const stopExpiry = setupSessionExpiry(router);
  const offEnded = onSessionEnded(reasons);
  onTestFinished(() => {
    stopExpiry();
    offEnded();
  });
  return { expiredTo, reasons };
}
