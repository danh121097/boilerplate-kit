import { hasServerSessionHint } from "@/server/server-api";
import { MOCK_USER_COOKIE, parseMockUser } from "@/services/auth/mock-auth-session";
import { getCookie } from "@tanstack/react-start/server";
import type { AuthUser } from "@/services/auth/types/auth";
import type { ServerUnauthorized } from "@/services/core/server-session";

/**
 * Dev-only mock auth, server side: the SSR counterpart of `readServerSession`
 * when `VITE_AUTH_MOCK` is on. There is no backend token cookie to forward, so
 * the signed-in user comes from the readable mock cookie the browser sends with
 * the page request (see `services/auth/mock-auth`). Same outcomes as the real
 * read: the user, or `ServerUnauthorized` carrying the session hint so the
 * browser refreshes a hinted session (the mock refresh answers from the same
 * cookie) instead of caching "signed out".
 */
export function readMockServerSession(): AuthUser | ServerUnauthorized {
  const user = parseMockUser(getCookie(MOCK_USER_COOKIE));
  if (user) return user;
  const unauthorized: ServerUnauthorized = {
    unauthorized: true,
    hasSession: hasServerSessionHint(),
  };
  return unauthorized;
}
