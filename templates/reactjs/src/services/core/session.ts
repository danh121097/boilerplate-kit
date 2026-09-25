import {
  getAccessToken,
  getRefreshToken,
  onTokensChanged,
} from "@/services/core/auth-token-storage";
import type { ApiService } from "@/services/core/types";

/**
 * Client session plumbing shared by the interceptors, the auth model, the auth
 * store and the root layout. Everything is per service ("MAIN" by default).
 *
 * Session end — logout and a refused refresh both end a service's session.
 * Listeners get the reason and the service; the app only treats the auth
 * service's session end as a sign-out (another service failing never logs the
 * user out). A 401 never reloads the page.
 *
 * Session epoch — a per-service counter that logout, session end and every
 * token clear bump. A refresh records the epoch when it starts and persists no
 * token when it moved meanwhile, so a refresh that resolves after logout cannot
 * resurrect the session. While a logout runs (`beginLogout`), no refresh of that
 * service may start at all.
 */

const sessionEpochs = new Map<ApiService, number>();

export function getSessionEpoch(service: ApiService = "MAIN"): number {
  return sessionEpochs.get(service) ?? 0;
}

/** Invalidate every refresh of `service` started before now. */
export function bumpSessionEpoch(service: ApiService = "MAIN"): void {
  sessionEpochs.set(service, getSessionEpoch(service) + 1);
}

const pendingLogouts = new Map<ApiService, number>();

/** A logout of `service` is running: no refresh may start (it would rotate the
 * token the logout is about to revoke) — refreshes reject with `SessionEndedError`. */
export function isLogoutPending(service: ApiService = "MAIN"): boolean {
  return (pendingLogouts.get(service) ?? 0) > 0;
}

/** Mark a logout of `service` as running until the returned `done()` is called
 * (idempotent). Call it synchronously at logout start, before any await. */
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

/** Subscribe to session end (logout / refused refresh). Returns the unsubscribe. */
export function onSessionEnded(listener: SessionEndListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Bump `service`'s epoch and notify every listener that its session ended.
 * Tokens are not touched here: the refresh manager or logout already cleared them. */
export function endSession(reason: SessionEndReason, service: ApiService = "MAIN"): void {
  bumpSessionEpoch(service);
  for (const listener of listeners) listener(reason, service);
}

/** A session is believed to exist while the service holds either token (the
 * access token may be gone while the refresh token can still renew it). */
export function hasStoredSession(service: ApiService = "MAIN"): boolean {
  return Boolean(getAccessToken(service) || getRefreshToken(service));
}

export interface AuthSyncHandlers {
  /** Another tab signed in — re-read the session and re-run the guards. */
  onLogin?: () => void;
  /** Another tab signed out (session-end listeners have already run). */
  onLogout?: () => void;
}

/**
 * Keep this tab in step with logins/logouts made in other tabs. The token slots
 * live in localStorage, so another tab writing or removing them fires a
 * `storage` event here; only a signed-in/out transition of the main session
 * counts (a token rotation by another tab's refresh is ignored). This tab's own
 * token writes keep the last known state current. A remote logout runs the
 * local session end (`endSession("logout", "MAIN")`) then `onLogout`; a remote
 * login calls `onLogin`. Browser-only; returns the unsubscribe.
 */
export function syncAuthAcrossTabs(handlers: AuthSyncHandlers = {}): () => void {
  if (typeof window === "undefined") return () => {};
  let known = hasStoredSession();

  const stopTokens = onTokensChanged((service) => {
    if (service === "MAIN") known = hasStoredSession();
  });
  const onStorage = () => {
    const stored = hasStoredSession();
    if (stored === known) return;
    known = stored;
    if (stored) {
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
 * Route to the login page when `service`'s session expires (the backend refused
 * the refresh). Logout is not a trigger — the caller navigates itself. Returns
 * the unsubscribe. Pair with `loginPathWithReturn` so the user lands back on
 * the page they were on.
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
