import type { ApiService } from "@/services/core/types";

/**
 * Session end — logout and a failed refresh both end the session. Listeners
 * (the auth store) drop the signed-in user and every cached query so no
 * signed-in data outlives it, and the UI routes to /login. A 401 never reloads
 * the page.
 *
 * Session epoch — a per-tab counter that logout and session end bump. A refresh
 * records the epoch when it starts and persists no token when the epoch moved
 * meanwhile, so a refresh that resolves after logout cannot resurrect the session.
 * While a logout runs (`beginLogout`), no refresh may start at all.
 */
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

let sessionEpoch = 0;

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

function notifySessionEnded(reason: SessionEndReason, service: ApiService): void {
  for (const listener of listeners) listener(reason, service);
}

/** Bump the epoch and notify every listener that the session for `service` ended. */
export function endSession(reason: SessionEndReason, service: ApiService = "MAIN"): void {
  bumpSessionEpoch();
  notifySessionEnded(reason, service);
}

export interface AuthSyncOptions {
  /** localStorage keys holding the session (the token slots). */
  keys: readonly string[];
  /** Whether this tab currently treats itself as signed in. */
  isSignedIn: () => boolean;
  /** Whether the shared storage holds a session now. */
  hasStoredSession: () => boolean;
  /** Another tab signed in — re-read the session and re-run the guards. */
  onLogin?: () => void;
  /** Another tab signed out (session-end listeners have already run). */
  onLogout?: () => void;
}

/**
 * Keep this tab in step with logins/logouts made in other tabs: the token slots
 * live in localStorage, so another tab writing or removing them fires a
 * `storage` event here. Only a signed-in/out transition counts — a token
 * rotation by another tab's refresh is ignored. A remote logout runs the local
 * session end (epoch bump + `onSessionEnded` listeners with "logout"); a remote
 * login calls `onLogin`. Browser-only; returns the unsubscribe.
 */
export function syncAuthAcrossTabs(options: AuthSyncOptions): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    // `key === null` → localStorage.clear() in another tab.
    if (event.key !== null && !options.keys.includes(event.key)) return;
    const stored = options.hasStoredSession();
    if (stored === options.isSignedIn()) return;
    if (stored) {
      options.onLogin?.();
      return;
    }
    bumpSessionEpoch();
    notifySessionEnded("logout", "MAIN");
    options.onLogout?.();
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
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
