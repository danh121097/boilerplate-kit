import { hasServerSessionHint, serverApiGet, ServerAuthError } from "@/server/server-api";
import { authContract } from "@/services/auth/contract";
import type { AuthUser } from "@/services/auth/types/auth";

/**
 * Current user for SSR prefetch. Anonymous (no session hint) → null, safe to
 * cache. A hinted session whose access cookie expired rethrows, so the prefetch
 * is not dehydrated and the client `useMeQuery` refetches through axios (which
 * refreshes) instead of caching a false "signed out".
 */
export async function getMeServerData(): Promise<AuthUser | null> {
  try {
    const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
    return body.user ?? null;
  } catch (error) {
    if (error instanceof ServerAuthError && !(await hasServerSessionHint())) return null;
    throw error;
  }
}
