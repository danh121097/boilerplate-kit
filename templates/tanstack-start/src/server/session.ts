import { readMockServerSession } from "@/server/mock-session";
import { hasServerSessionHint, serverApiGet } from "@/server/server-api";
import { authContract } from "@/services/auth/contract";
import { getMockAuth } from "@/services/auth/data/mock-auth-config";
import { isServerUnauthorized } from "@/services/core/server-session";
import type { AuthUser } from "@/services/auth/types/auth";
import type { ServerUnauthorized } from "@/services/core/server-session";

/**
 * Server-side session read — never refreshes. Resolves the current user, null
 * when the backend knows no user, or `ServerUnauthorized` (not null) when the
 * access cookie is missing or rejected, carrying whether the request had the
 * session hint: the client refreshes a hinted session instead of caching
 * "signed out", and treats an unhinted one as anonymous (`fetchSession` maps it
 * to null). Without the hint no request is made at all: a logout whose request
 * failed leaves the httpOnly access cookie alive for minutes, and it must not
 * resurrect the session. Other failures (5xx, unreachable) reject. Server-only —
 * reached from the client only through `getMeServerFn`.
 *
 * With the dev-only mock auth on (`VITE_AUTH_MOCK`) the user comes from the mock
 * cookie instead of the backend; the branch is dropped from production builds.
 */
export async function readServerSession(): Promise<AuthUser | null | ServerUnauthorized> {
  const mock = !import.meta.env.PROD ? getMockAuth() : null;
  if (mock) return readMockServerSession();
  // No hint: anonymous (or logged out) — nothing to restore, no network call.
  if (!hasServerSessionHint()) return { unauthorized: true, hasSession: false };
  const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
  return isServerUnauthorized(body) ? body : (body.user ?? null);
}
