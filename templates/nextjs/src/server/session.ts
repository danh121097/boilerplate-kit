import { hasServerSessionHint, serverApiGet } from "@/server/server-api";
import { authContract } from "@/services/auth/contract";
import { isUnauthorizedError } from "@/services/core/api-errors";
import type { AuthUser } from "@/services/auth/types/auth";

/**
 * Server-side session read for SSR prefetch — never refreshes. Anonymous (no
 * session hint) + 401 → null, safe to cache. A hinted session whose access
 * cookie expired rejects, so the prefetch is not dehydrated and the client
 * `useMeQuery` refetches through axios (which refreshes) instead of caching a
 * false "signed out". Any other failure (5xx, unreachable) rejects too.
 */
export async function readServerSession(): Promise<AuthUser | null> {
  try {
    const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
    return body.user ?? null;
  } catch (error) {
    if (isUnauthorizedError(error) && !(await hasServerSessionHint())) return null;
    throw error;
  }
}
