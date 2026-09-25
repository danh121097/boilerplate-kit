import { getAppPrefix } from "@/services/core/app-prefix";

/**
 * Readable (non-httpOnly) "a session exists" hint cookie — `${APP_NAME}_SESSION=1`.
 *
 * The auth tokens are httpOnly cookies, so JS cannot tell an anonymous visitor
 * from a signed-in user whose 15-minute access cookie just expired. The hint is
 * set on login / register / refresh success and cleared on logout / session
 * expiry. It only drives UX:
 * - no hint → a 401 is just "anonymous": no refresh call, no redirect;
 * - hint + refused refresh → the session ended: clear state and go to /login,
 *   even when nothing about the user was cached yet (cold page load).
 * It carries no secret and is NEVER trusted for authorization — the backend
 * decides that from the httpOnly cookies. Its lifetime mirrors the backend's
 * 7-day refresh cookie.
 */

const SESSION_HINT_MAX_AGE = 7 * 24 * 60 * 60;

/** `${APP_NAME}_SESSION` — matches `useStorageKeys("SESSION")`. */
const cookieName = () => `${getAppPrefix()}_SESSION`;

/**
 * Session epoch, bumped whenever the session ends (logout, expiry). A refresh
 * captures it before its network call and discards its result if it changed —
 * so a refresh still in flight at logout cannot re-mark the session active.
 */
let sessionEpoch = 0;

export function getSessionEpoch(): number {
  return sessionEpoch;
}

/** Count of running logouts — no new refresh may start meanwhile. */
let pendingLogouts = 0;

/** Invalidate every refresh started before now: a refresh still in flight marks nothing. */
export function bumpSessionEpoch(): void {
  sessionEpoch += 1;
}

/** A logout is running: every new refresh — and every 401 that would trigger
 * one — rejects with `session_ended`. */
export function isLogoutPending(): boolean {
  return pendingLogouts > 0;
}

/**
 * Mark a logout as running until the returned `done()` is called (idempotent).
 * Call synchronously when logout starts, before any await; logout then bumps
 * the epoch right before its request, so a 401 arriving while it is in flight
 * cannot rotate the refresh cookie being revoked.
 */
export function beginLogout(): () => void {
  pendingLogouts += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pendingLogouts -= 1;
  };
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * True when the hint cookie is present. In the browser it reads
 * `document.cookie`; during SSR the incoming request's cookie header (call it
 * synchronously inside a Nuxt context — before any `await`).
 */
export function hasSessionHint(): boolean {
  if (typeof document !== "undefined") return readCookie(document.cookie, cookieName()) === "1";
  try {
    // Server: only valid inside a Nuxt request context.
    return readCookie(useRequestHeaders(["cookie"]).cookie, cookieName()) === "1";
  } catch {
    return false;
  }
}

/** Hint presence as this tab last wrote or observed it (null until first read). */
let knownHint: boolean | null = null;

/**
 * Detect a hint change this tab did not make — another tab logged in
 * ("signed-in") or out ("signed-out"), or the hint expired. The first call only
 * records the current state. Browser-only: the cookie emits no `storage` event,
 * so callers poll it on focus / visibility.
 */
export function detectSessionHintChange(): "signed-in" | "signed-out" | null {
  const present = hasSessionHint();
  const previous = knownHint;
  knownHint = present;
  if (previous === null || previous === present) return null;
  return present ? "signed-in" : "signed-out";
}

/** Mark (or renew) the hint after a successful login / register / refresh. */
export function markSessionActive(): void {
  if (typeof document === "undefined") return;
  knownHint = true;
  document.cookie = `${cookieName()}=1; path=/; max-age=${SESSION_HINT_MAX_AGE}; SameSite=Lax`;
}

/** Drop the hint on logout / session expiry (and end the session epoch). */
export function clearSessionHint(): void {
  sessionEpoch += 1;
  if (typeof document === "undefined") return;
  knownHint = false;
  document.cookie = `${cookieName()}=; path=/; max-age=0; SameSite=Lax`;
}
