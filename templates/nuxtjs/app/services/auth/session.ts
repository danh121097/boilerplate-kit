import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import { isMockAuthEnabled } from "@/services/auth/mock-auth-config";
import { mockUnauthorizedError } from "@/services/auth/mock-auth-responses";
import { readMockServerUser } from "@/services/auth/mock-auth-session";
import { defineQuery, hasSessionHint, serverApiGet } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "@/services/auth/types/auth";

/**
 * Resolve the signed-in user (null when anonymous).
 *
 * - SSR: without the session hint it is an anonymous visitor → null, no request.
 *   Otherwise a direct signed fetch with the forwarded cookie. It cannot refresh.
 *   Any failure — including a 401 while the hint says a session exists (an access
 *   cookie that merely expired) — rejects. Read it with `useServerRenderedQuery`
 *   (the layout does): a 401 renders signed-out and the browser resolves it after
 *   hydration instead of the page showing a stale "logged out"; any other failure
 *   is rendered and hydrated as that error (the layout's retry banner).
 * - Browser: through the axios Model, which refreshes-and-retries on 401. A 401
 *   that survives the refresh resolves null; while the hint is set it is a
 *   session the server rejected, so it is first revoked
 *   (`AuthModel.revokeSession` — ends it as "expired", unless it already
 *   ended). Without the hint it is an anonymous visitor. Any other error
 *   (network, 5xx) surfaces to the query rather than looking like a logout.
 */
export function fetchSessionUser(): Promise<AuthUser | null> {
  if (import.meta.server) return readServerSession();
  // No session hint: an anonymous visitor. Signed out without a network call, so
  // an unreachable backend never shows the session-unavailable banner to them.
  if (typeof document !== "undefined" && !hasSessionHint()) return Promise.resolve(null);
  return AuthModel.getSession();
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
  // No hint: an anonymous visitor. Nothing to look up, no network call.
  if (!hinted) return null;
  // Hint set: any failure rejects, including a 401 (an expired access cookie only
  // the browser can refresh), so the query is resolved after hydration.
  const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
  return body?.user ?? null;
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
