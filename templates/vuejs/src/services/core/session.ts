import {
  getAccessToken,
  getRefreshToken,
  onTokensChanged,
} from "@/services/core/auth-token-storage";
import type { ApiService } from "@/services/core/types";

/**
 * Client session plumbing shared by the interceptors, the auth model, the store
 * and the router.
 *
 * Session epoch — a per-service counter bumped whenever that service's session
 * is cleared (logout, refused refresh, cleared tokens). A refresh captures it
 * before its network call and persists nothing when it moved meanwhile, so a
 * refresh still in flight at logout cannot write the tokens back. While a
 * logout runs (`beginLogout`), no refresh may start at all.
 *
 * Session end — logout and a refused refresh both end a service's session;
 * listeners (the auth store, the query cache, the router) filter on the service
 * and react. The service layer never reloads the page or touches the router.
 *
 * Cross-tab sync — tokens live in localStorage, so another tab's login/logout
 * reaches this one as a `storage` event (see `syncAuthAcrossTabs`).
 */

const sessionEpochs = new Map<string, number>();

export function getSessionEpoch(service: ApiService = "MAIN"): number {
  return sessionEpochs.get(service) ?? 0;
}

/** Invalidate every refresh of `service` started before now: one still in flight persists nothing. */
export function bumpSessionEpoch(service: ApiService = "MAIN"): void {
  sessionEpochs.set(service, getSessionEpoch(service) + 1);
}

/** Per-service count of running logouts — no new refresh may start meanwhile. */
const pendingLogouts = new Map<string, number>();

/** A logout is running for `service`: every new refresh — and every 401 that
 * would trigger one — rejects with `session_ended`. */
export function isLogoutPending(service: ApiService = "MAIN"): boolean {
  return (pendingLogouts.get(service) ?? 0) > 0;
}

/**
 * Mark a logout as running until the returned `done()` is called (idempotent).
 * Call synchronously when logout starts, before any await; logout then bumps
 * the epoch in the same tick it captures the tokens to revoke.
 */
export function beginLogout(service: ApiService = "MAIN"): () => void {
  pendingLogouts.set(service, (pendingLogouts.get(service) ?? 0) + 1);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pendingLogouts.set(service, (pendingLogouts.get(service) ?? 1) - 1);
  };
}

export type SessionEndReason = "logout" | "expired";
type SessionEndListener = (reason: SessionEndReason, service: ApiService) => void;

const listeners = new Set<SessionEndListener>();

/** Subscribe to session end (logout / refused refresh); returns the unsubscribe. */
export function onSessionEnded(listener: SessionEndListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * End `service`'s session: bump its epoch, then notify listeners. Tokens are
 * not touched here — the refresh manager (refused refresh) or logout already
 * cleared them.
 */
export function endSession(reason: SessionEndReason, service: ApiService = "MAIN"): void {
  bumpSessionEpoch(service);
  for (const listener of listeners) listener(reason, service);
}

/** An access or refresh token is stored for `service`. */
export function hasStoredSession(service: ApiService = "MAIN"): boolean {
  return Boolean(getAccessToken(service) || getRefreshToken(service));
}

export interface AuthSyncHandlers {
  /** Another tab signed in — re-read the session. */
  onLogin?: () => void;
  /** Another tab signed out (session-end listeners have already run). */
  onLogout?: () => void;
}

/**
 * Keep this tab in step with logins/logouts made in other tabs. The `storage`
 * event fires only in the OTHER tabs; on each one this tab re-reads whether a
 * MAIN session is stored and compares it with the last known value. A remote
 * logout ends the local session ("logout") then calls `onLogout`; a remote
 * login calls `onLogin`; a token rotation (presence unchanged) is ignored.
 * Browser-only; returns the unsubscribe.
 */
export function syncAuthAcrossTabs(handlers: AuthSyncHandlers = {}): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }
  let known = hasStoredSession();
  // This tab's own logins/logouts move the baseline too, so the next remote
  // change is compared with the current state, not the one at startup.
  const stopTokens = onTokensChanged((service) => {
    if (service === "MAIN") known = hasStoredSession();
  });

  const onStorage = () => {
    const signedIn = hasStoredSession();
    if (signedIn === known) return;
    known = signedIn;
    if (signedIn) {
      handlers.onLogin?.();
      return;
    }
    endSession("logout", "MAIN");
    handlers.onLogout?.();
  };

  window.addEventListener("storage", onStorage);
  return () => {
    stopTokens();
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Call `redirect` when `service`'s live session expires (the backend refused
 * the refresh). Logout is not a trigger — the caller navigates itself. Returns
 * the unsubscribe. Pair with `loginPathWithReturn` so the user lands back on the
 * page they were on.
 */
export function redirectOnSessionExpired(
  redirect: () => void,
  service: ApiService = "MAIN",
): () => void {
  return onSessionEnded((reason, ended) => {
    if (reason === "expired" && ended === service) redirect();
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
