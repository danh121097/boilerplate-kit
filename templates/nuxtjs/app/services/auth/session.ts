import { authContract } from "./contract";
import { serverApiGet, defineQuery } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "./types/auth";

/**
 * Canonical session query — fetches the backend `/auth/me` directly (cookie
 * forwarded on SSR by `serverApiGet`). Prefetched on the server and hydrated to the
 * client, then Vue Query-managed: auth mutations invalidate `auth.me` so it
 * re-resolves after login/logout.
 */
export const useSessionQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: async () => {
    const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
    return body?.user ?? null;
  },
});

/**
 * Derived auth state: `const { isAuthenticated } = useAuth()`.
 * Derived from the session query (not stored), so it can never drift from the
 * real cookie session.
 */
export function useAuth() {
  const session = useSessionQuery();
  return {
    user: session.data.value ?? null,
    isAuthenticated: Boolean(session.data.value),
    isLoading: session.isPending.value,
  };
}
