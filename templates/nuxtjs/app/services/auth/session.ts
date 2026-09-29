import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import { isMockAuthEnabled } from "@/services/auth/mock-auth-config";
import { mockUnauthorizedError } from "@/services/auth/mock-auth-responses";
import { readMockServerUser } from "@/services/auth/mock-auth-session";
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
 *   swallows it): the browser resolves a failed query again on hydration (a 401
 *   is not dehydrated; other errors are, and are retried on mount) instead of
 *   the page rendering a stale "logged out".
 * - Browser: through the axios Model, which refreshes-and-retries on 401. A 401
 *   that survives the refresh resolves null; while the hint is set it is a
 *   session the server rejected, so it is first revoked
 *   (`AuthModel.revokeSession` — ends it as "expired", unless it already
 *   ended). Without the hint it is an anonymous visitor. Any other error
 *   (network, 5xx) surfaces to the query rather than looking like a logout.
 */
export function fetchSessionUser(): Promise<AuthUser | null> {
  return import.meta.server ? readServerSession() : AuthModel.getSession();
}

/** The SSR branch of `fetchSessionUser`. It never refreshes. Call it inside
 * the request's Nuxt context: the hint is read before the first await. */
export async function readServerSession(): Promise<AuthUser | null> {
  const hinted = hasSessionHint();
  // Dev-only mock auth: the user comes from the mock cookie, not the backend.
  // The branch is dropped from production builds.
  if (!import.meta.env.PROD && isMockAuthEnabled()) {
    const user = readMockServerUser();
    if (user) return user;
    if (!hinted) return null;
    throw mockUnauthorizedError(); // hinted, cookie gone: the browser resolves it
  }
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

export const useMeQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: fetchSessionUser,
});

export function useAuth() {
  const session = useMeQuery();
  return {
    user: session.data.value ?? null,
    isAuthenticated: Boolean(session.data.value),
    isLoading: session.isPending.value,
  };
}
