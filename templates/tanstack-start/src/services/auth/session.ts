import { getMeServerFn } from "@/server/get-me";
import { defineQuery, isUnauthorizedError, withSessionRefresh } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "@/services/auth/types/auth";

/** Current user or null. Signed out (anonymous, or a refresh that failed) → null;
 * an expired-but-refreshable session is refreshed in the browser first. */
export async function fetchSession(): Promise<AuthUser | null> {
  try {
    return await withSessionRefresh(() => getMeServerFn());
  } catch (error) {
    if (isUnauthorizedError(error)) return null;
    throw error; // network/5xx or "deferred to the browser" — never cached as signed out
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
