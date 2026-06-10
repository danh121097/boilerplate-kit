import { getMeServerFn } from "@/server/get-me";
import { defineQuery } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "./types/auth";

/**
 * Canonical session query — backed by `getMeServerFn` (resolves on the server
 * during SSR, via RPC on the client). Auth mutations invalidate `auth.me` so it
 * re-resolves against the cookies after login/logout.
 */
export const useSessionQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: () => getMeServerFn(),
});

/**
 * Derived auth state: `const { isAuthenticated } = useAuth()`. Derived from the
 * session query (not stored), so it can never drift from the real cookie session.
 */
export function useAuth() {
  const session = useSessionQuery();
  return {
    user: session.data ?? null,
    isAuthenticated: Boolean(session.data),
    isLoading: session.isPending,
  };
}
