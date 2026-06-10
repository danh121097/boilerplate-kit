import { useMeQuery } from "./auth";

/**
 * Derived client auth state: `const { isAuthenticated, user } = useAuth()`.
 * Derived from the client session query (not stored), so it can't drift from the
 * cookie session. For SSR session resolution call `getMeServerData()` from
 * `@/server/get-me` directly in a Server Component — keep this file free of
 * server-only imports (the auth barrel is reachable from "use client" code).
 */
export function useAuth() {
  const session = useMeQuery();
  return {
    user: session.data ?? null,
    isAuthenticated: Boolean(session.data),
    isLoading: session.isPending,
  };
}
