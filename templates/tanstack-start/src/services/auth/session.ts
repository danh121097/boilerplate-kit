import { getMeServerFn } from "@/server/get-me";
import { AuthModel } from "@/services/auth/auth";
import {
  defineQuery,
  getSessionEpoch,
  hasSessionHint,
  isUnauthorizedError,
  withSessionRefresh,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "@/services/auth/types/auth";

/** Current user or null. Signed out (anonymous, or a refresh that failed) → null;
 * an expired-but-refreshable session is refreshed in the browser first. In the
 * browser, a session that still 401s while live (hint set, not ended meanwhile)
 * is revoked (`AuthModel.revokeSession`, ends as "expired"); during SSR nothing
 * is revoked. Without the session hint (anonymous, or logged out) it resolves
 * null with no request, so an unreachable backend never shows the
 * session-unavailable banner to them and a lingering access cookie cannot
 * contradict the hint-based route guards. */
export async function fetchSession(): Promise<AuthUser | null> {
  if (typeof document !== "undefined" && !hasSessionHint()) return null;
  const epoch = getSessionEpoch(AuthModel.service);
  try {
    return await withSessionRefresh(() => getMeServerFn());
  } catch (error) {
    if (!isUnauthorizedError(error)) throw error; // network/5xx or "deferred to the browser" — never cached as signed out
    await AuthModel.revokeSession(epoch); // resolves false during SSR
    return null;
  }
}

/**
 * Canonical session query — backed by `getMeServerFn` (resolves on the server
 * during SSR, via RPC on the client). Auth mutations invalidate `auth.me` so it
 * re-resolves against the cookies after login/logout.
 */
export const useMeQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: fetchSession,
});

/** A transient failure (offline, timeout, 5xx, refresh unavailable) restoring the
 * session: the user keeps their current state and may retry. A 401 never reaches
 * here — `fetchSession` resolves it to signed out. */
export function isSessionUnavailable(error: unknown): boolean {
  return (error as { retryable?: unknown } | null)?.retryable === true;
}

/**
 * Derived auth state: `const { isAuthenticated } = useAuth()`. Derived from the
 * session query (not stored), so it can never drift from the real cookie session.
 */
export function useAuth() {
  const session = useMeQuery();
  return {
    user: session.data ?? null,
    isAuthenticated: Boolean(session.data),
    isLoading: session.isPending,
    /** Restoring the session failed transiently — show the retry banner. */
    sessionUnavailable: isSessionUnavailable(session.error),
    /** Re-run the session restore (the banner's retry). */
    retrySession: () => void session.refetch(),
  };
}
