import { serverApiGet } from "@/server/server-api";
import { authContract } from "@/services/auth/contract";
import { isServerUnauthorized } from "@/services/core/server-auth";
import type { AuthUser } from "@/services/auth/types/auth";
import type { ServerUnauthorized } from "@/services/core/server-auth";

/** Server-side session read: the current user, or `ServerUnauthorized` (not
 * null) when the session cannot be proven, so the client can refresh instead of
 * caching "signed out" (`fetchSession` maps anonymous/failed-refresh to null).
 * Server-only — reached from the client only through `getMeServerFn`. */
export async function readSessionUser(): Promise<AuthUser | null | ServerUnauthorized> {
  const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
  return isServerUnauthorized(body) ? body : (body.user ?? null);
}
