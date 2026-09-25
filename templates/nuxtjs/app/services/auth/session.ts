import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import { defineQuery, hasSessionHint, isUnauthorizedError, serverApiGet } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "@/services/auth/types/auth";

/**
 * Resolve the signed-in user (null when anonymous).
 *
 * - SSR: a direct signed fetch with the forwarded cookie. It cannot refresh. A
 *   401 without the session hint is an anonymous visitor → null. Any other
 *   failure — including a 401 while the hint says a session exists (an access
 *   cookie that merely expired) — rejects. Prefetch with `prefetchQuery` (which
 *   swallows it): a failed query is not dehydrated, so the browser resolves it on
 *   hydration instead of the page rendering a stale "logged out".
 * - Browser: through the axios Model, which refreshes-and-retries on 401. A 401
 *   that survives the refresh means anonymous → null; any other error (network,
 *   5xx) surfaces to the query rather than looking like a logout.
 */
export async function fetchSessionUser(): Promise<AuthUser | null> {
  if (import.meta.server) return fetchServerSessionUser();
  try {
    return await AuthModel.getMe();
  } catch (error) {
    if (isUnauthorizedError(error)) return null;
    throw error;
  }
}

/** The SSR branch of `fetchSessionUser` (exported for tests). Call it inside
 * the request's Nuxt context: the hint is read before the first await. */
export async function fetchServerSessionUser(): Promise<AuthUser | null> {
  const hinted = hasSessionHint();
  try {
    const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
    return body?.user ?? null;
  } catch (error) {
    // No hint → anonymous visitor. Hint → an expired access cookie only the
    // browser can refresh: reject so the query is resolved after hydration.
    if (isUnauthorizedError(error) && !hinted) return null;
    throw error;
  }
}

export const useSessionQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: fetchSessionUser,
});

export function useAuth() {
  const session = useSessionQuery();
  return {
    user: session.data.value ?? null,
    isAuthenticated: Boolean(session.data.value),
    isLoading: session.isPending.value,
  };
}
