import { getAccessToken, getRefreshToken } from "@/services/core/auth-token-storage";
import type { ApiService } from "@/services/core/types";

/**
 * Session lifecycle shared by the refresh manager, the interceptors, logout and
 * the app: the per-service epoch, logout-pending, session-ended events, the
 * stored-session check and the return-path guard.
 */

/**
 * Per-service session epoch, bumped whenever a service's session ends (logout,
 * refused refresh, every token clear). A refresh captures it before its network
 * call and drops its result if it changed meanwhile; a request captures it when
 * sent, so a 401 arriving after the session ended is reported as ended instead
 * of being refreshed.
 */
const sessionEpochs = new Map<string, number>();

/** Current session epoch for a service (0 until its session first ends). */
export function getSessionEpoch(service: ApiService = "MAIN"): number {
  return sessionEpochs.get(service) ?? 0;
}

/** Invalidate every refresh and request started before now for `service`. */
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
 * Call synchronously when logout starts, before any await: storage reads
 * are async, so this flag is what blocks a refresh while logout reads the
 * tokens it is about to revoke.
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

/** `logout`: the user signed out. `expired`: the refresh endpoint refused the
 * refresh token. */
export type SessionEndReason = "expired" | "logout";

type SessionEndedListener = (reason: SessionEndReason, service: ApiService) => void;

const sessionEndedListeners = new Set<SessionEndedListener>();

/**
 * Subscribe to session ends of every service. Listeners that act on the app's
 * own session (auth store, query cache) must filter on the auth service — a
 * secondary backend's refused refresh ends only that backend's session.
 * Returns the unsubscribe.
 */
export function onSessionEnded(listener: SessionEndedListener): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

/**
 * End `service`'s session: bump its epoch, then notify listeners. Tokens are
 * not cleared here — the refresh manager (refused refresh) and logout already
 * did. There is no cross-tab broadcast on React Native.
 */
export function endSession(reason: SessionEndReason, service: ApiService = "MAIN"): void {
  bumpSessionEpoch(service);
  for (const listener of [...sessionEndedListeners]) listener(reason, service);
}

/** A session exists while either token is stored (the access token may be gone
 * while the refresh token can still renew it). Async: storage reads are. */
export async function hasStoredSession(service: ApiService = "MAIN"): Promise<boolean> {
  const [access, refresh] = await Promise.all([getAccessToken(service), getRefreshToken(service)]);
  return Boolean(access || refresh);
}

const MAX_REDIRECT_LENGTH = 512;

/**
 * Validate a `redirect` route param (untrusted: it can arrive via a deep link)
 * and fall back to `fallback` (home by default). Only in-app expo-router paths pass:
 * - a single leading "/" (rejects "//host", "/\host" and anything with a scheme);
 * - no backslash anywhere;
 * - no control characters, bounded length;
 * - never the login screen itself (would loop).
 * A repeated param (an array) uses its first value.
 */
export function safeRedirect(value: unknown, fallback = "/"): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.length > MAX_REDIRECT_LENGTH) return fallback;
  // eslint-disable-next-line no-control-regex
  if (!/^\/(?![/\\])/.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (raw.includes("\\") || raw.includes("://")) return fallback;
  const path = raw.split(/[?#]/)[0] ?? "";
  if (path === "/login" || path.startsWith("/login/")) return fallback;
  return raw;
}
