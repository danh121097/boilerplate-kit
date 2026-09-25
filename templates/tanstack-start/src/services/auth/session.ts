import { getMeServerFn } from "@/server/get-me";
import { AuthModel } from "@/services/auth/auth";
import {
  defineQuery,
  getSessionEpoch,
  isUnauthorizedError,
  withSessionRefresh,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "@/services/auth/types/auth";

/** Current user or null. Signed out (anonymous, or a refresh that failed) → null;
 * an expired-but-refreshable session is refreshed in the browser first. In the
 * browser, a session that still 401s while live (hint set, not ended meanwhile)
 * is revoked (`AuthModel.revokeSession`, ends as "expired"); during SSR nothing
 * is revoked. */
export async function fetchSession(): Promise<AuthUser | null> {
  const epoch = getSessionEpoch(AuthModel.service);
  try {
    return await withSessionRefresh(() => getMeServerFn());
  } catch (error) {
    if (!isUnauthorizedError(error)) throw error; // network/5xx or "deferred to the browser" — never cached as signed out
    if (typeof window !== "undefined") await AuthModel.revokeSession(epoch);
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
  };
}
