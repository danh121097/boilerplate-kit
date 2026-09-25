import { STORAGE_KEYS } from "@/enums";
import { readCookie } from "@/utils/cookie-storage";
import type { ApiService } from "@/services/core/types";

/**
 * Client session plumbing shared by the interceptors, the auth model and the
 * providers.
 *
 * Session hint — the auth tokens are httpOnly cookies, so JS cannot tell an
 * anonymous visitor from a signed-in user whose 15-minute access cookie just
 * expired. A readable `SESSION` cookie (no secret, just "1") is set on
 * login/register/refresh and cleared on logout/refresh failure. Its only job is
 * to decide whether a 401 is worth a refresh attempt: no hint → anonymous → the
 * 401 is final (no refresh request, no reload). The server reads the same
 * cookie to tell "anonymous" from "session needs a refresh". Its lifetime
 * matches the backend's 7-day refresh cookie.
 *
 * Session end — logout and a failed refresh both end the session; listeners
 * (the QueryClient provider) drop every cached query so no signed-in data
 * outlives it.
 *
 * Session epoch — a per-tab counter that logout and session end bump. A refresh
 * records the epoch when it starts and persists nothing (hint, "last refresh"
 * stamp) when the epoch moved meanwhile, so a refresh that resolves after
 * logout cannot resurrect the session. While a logout runs (`beginLogout`), no
 * refresh may start at all.
 *
 * Cross-tab sync — login/logout write `STORAGE_KEYS.AUTH_SYNC`; other tabs see
 * the `storage` event (and re-check the hint cookie when they become visible)
 * and recompute their auth state — see `syncAuthAcrossTabs`.
 */

const SESSION_HINT_MAX_AGE = 7 * 24 * 60 * 60; // mirrors the backend refresh cookie

let sessionEpoch = 0;

/** Hint state this tab last set or observed — dedupes cross-tab notifications. */
let knownHint: boolean | null = null;

export function getSessionEpoch(): number {
  return sessionEpoch;
}

/** Invalidate every refresh started before now (see "Session epoch" above). */
export function bumpSessionEpoch(): void {
  sessionEpoch += 1;
}

let pendingLogouts = 0;

/** A logout is running: no refresh may start (it would rotate the token the
 * logout is about to revoke) — refreshes reject with `SessionEndedError`. */
export function isLogoutPending(): boolean {
  return pendingLogouts > 0;
}

/** Mark a logout as running until the returned `done()` is called. Call it
 * synchronously at logout start, before any await. */
export function beginLogout(): () => void {
  pendingLogouts += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pendingLogouts -= 1;
  };
}

export function hasSessionHint(): boolean {
  return readCookie(STORAGE_KEYS.SESSION) === "1";
}

/** Mark (or renew) the session hint after a successful login/register/refresh. */
export function markSessionActive(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${STORAGE_KEYS.SESSION}=1; path=/; max-age=${SESSION_HINT_MAX_AGE}; SameSite=Lax`;
  knownHint = true;
}

export function clearSessionHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${STORAGE_KEYS.SESSION}=; path=/; max-age=0; SameSite=Lax`;
  knownHint = false;
}

type AuthSyncKind = "login" | "logout";

/** Tell other tabs this one logged in / out (they receive a `storage` event). */
function broadcastAuthChange(kind: AuthSyncKind): void {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTH_SYNC, `${kind}:${Date.now()}`);
  } catch {
    // Storage unavailable (private mode / SSR) — other tabs catch up on focus.
  }
}

/** A login/register succeeded: set the hint and tell the other tabs. */
export function startSession(): void {
  markSessionActive();
  broadcastAuthChange("login");
}

export type SessionEndReason = "logout" | "expired";
type SessionEndListener = (reason: SessionEndReason, service: ApiService) => void;

const listeners = new Set<SessionEndListener>();

/** Subscribe to session end (logout / refresh failure). Returns the unsubscribe. */
export function onSessionEnded(listener: SessionEndListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySessionEnded(reason: SessionEndReason, service: ApiService): void {
  for (const listener of listeners) listener(reason, service);
}

/** End the client session: bump the epoch, drop the hint, tell the other tabs
 * and notify listeners. */
export function endSession(reason: SessionEndReason, service: ApiService = "MAIN"): void {
  bumpSessionEpoch();
  clearSessionHint();
  broadcastAuthChange("logout");
  notifySessionEnded(reason, service);
}

export interface AuthSyncHandlers {
  /** Another tab signed in — re-read the session. */
  onLogin?: () => void;
  /** Another tab signed out (session-end listeners have already run). */
  onLogout?: () => void;
}

/**
 * Keep this tab in step with logins/logouts made in other tabs. A remote logout
 * runs the local session end (epoch bump + `onSessionEnded` listeners with
 * "logout", no re-broadcast); a remote login calls `onLogin`. Triggers: the
 * `AUTH_SYNC` storage event, and a hint-cookie re-check whenever the tab becomes
 * visible (cookie changes fire no event). Browser-only; returns the unsubscribe.
 */
export function syncAuthAcrossTabs(handlers: AuthSyncHandlers = {}): () => void {
  if (typeof window === "undefined") return () => {};
  knownHint = hasSessionHint();

  const apply = (signedIn: boolean) => {
    if (signedIn === knownHint) return;
    knownHint = signedIn;
    if (signedIn) {
      handlers.onLogin?.();
      return;
    }
    bumpSessionEpoch();
    notifySessionEnded("logout", "MAIN");
    handlers.onLogout?.();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEYS.AUTH_SYNC || !event.newValue) return;
    apply(event.newValue.startsWith("login"));
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") apply(hasSessionHint());
  };

  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Route to the login page when a live session expires (the backend refused the
 * refresh). Anonymous visitors never trigger it: "expired" is only emitted after
 * a refresh attempt, and a refresh is only attempted while the session hint is
 * present. Logout is not a redirect trigger — the caller navigates itself.
 * Returns the unsubscribe. Pair with `loginPathWithReturn` so the user lands
 * back on the page they were on.
 */
export function redirectOnSessionExpired(redirect: () => void): () => void {
  return onSessionEnded((reason) => {
    if (reason === "expired") redirect();
  });
}

/** `/login?redirect=<current path>` — the path the login page returns to. */
export function loginPathWithReturn(currentPath: string): string {
  return `/login?redirect=${encodeURIComponent(currentPath)}`;
}

/** Longest `redirect` value accepted as a return path. */
const MAX_REDIRECT_LENGTH = 512;

/**
 * Same-origin return path from an untrusted `redirect` value, else `fallback`.
 * Accepted only when ALL hold: a string of at most 512 chars; starts with
 * exactly one "/" ("//host" and "/\host" are protocol-relative to another
 * origin); no "\" and no control character anywhere (the URL parser strips
 * tab/CR/LF, so "/\t/evil.example" would resolve to "//evil.example"); no
 * "://"; and not the login page itself (which would loop).
 */
export function safeRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > MAX_REDIRECT_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex -- matching control chars is the point
  if (value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value)) return fallback;
  if (value.includes("://")) return fallback;
  if (/^\/login\/?(?:[?#]|$)/.test(value)) return fallback;
  return value;
}

/** A rejected API call whose HTTP status (or envelope `error_code`) is 401. */
export function isUnauthorizedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { error_code?: unknown }).error_code === 401
  );
}
