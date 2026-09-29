import { STORAGE_KEYS } from "@/enums";
import { hasSessionHint, loginPathWithReturn, safeRedirect } from "@/services/core/session";
import { redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/**
 * Route guards for `beforeLoad`. The signal is the readable session hint cookie,
 * checked synchronously — no profile fetch. It is read from the request during
 * SSR (no flash of the protected page) and from `document.cookie` on client
 * navigations. A hint whose tokens expired still passes: the client refreshes
 * through the normal 401 flow.
 */
const isSignedIn = createIsomorphicFn()
  .server(() => {
    try {
      return getCookie(STORAGE_KEYS.SESSION) === "1";
    } catch {
      // Outside a Start request scope — no cookie to read.
      return false;
    }
  })
  .client(() => hasSessionHint());

/** Protected route: a guest goes to `/login?redirect=<original full path>`. */
export function requireSession(location: { href: string }): void {
  if (!isSignedIn()) throw redirect({ href: loginPathWithReturn(location.href) });
}

/** Guest-only route: a signed-in user goes to the safe `redirect` target, else home. */
export function redirectIfSignedIn(search: { redirect?: string }): void {
  if (isSignedIn()) throw redirect({ href: safeRedirect(search.redirect) });
}
