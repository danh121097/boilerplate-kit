import { serverApiGet } from "@/server/server-api";
import { authContract } from "@/services/auth/contract";
import { isServerUnauthorized } from "@/services/core/server-session";
import type { AuthUser } from "@/services/auth/types/auth";
import type { ServerUnauthorized } from "@/services/core/server-session";

/**
 * Server-side session read — never refreshes. Resolves the current user, null
 * when the backend knows no user, or `ServerUnauthorized` (not null) when the
 * access cookie is missing or rejected, carrying whether the request had the
 * session hint: the client refreshes a hinted session instead of caching
 * "signed out", and treats an unhinted one as anonymous (`fetchSession` maps it
 * to null). Other failures (5xx, unreachable) reject. Server-only — reached from
 * the client only through `getMeServerFn`.
 */
export async function readServerSession(): Promise<AuthUser | null | ServerUnauthorized> {
  const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
  return isServerUnauthorized(body) ? body : (body.user ?? null);
}
