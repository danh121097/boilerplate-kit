import { hasServerSessionHint, toServerApiError } from "@/server/server-api";
import { MOCK_USER_COOKIE, parseMockUser } from "@/services/auth/mock-auth-session";
import { usersContract } from "@/services/users/contract";
import { respondMockUsers } from "@/services/users/mock-users";
import { getCookie } from "@tanstack/react-start/server";
import type { MockAuthConfig } from "@/services/auth/mock-auth-config";
import type { AuthUser } from "@/services/auth/types/auth";
import type { PaginatedResponse } from "@/services/core";
import type { ServerUnauthorized } from "@/services/core/server-session";
import type { User } from "@/services/users/types/user";

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

/**
 * Dev-only mock users, server side: the SSR counterpart of `serverApiPaginate`
 * for the users list when `VITE_AUTH_MOCK` is on. The caller is the same mock
 * cookie the session read uses, and the checks and envelope are the mock users
 * API's (`services/users/mock-users`). Outcomes match the real read: the
 * paginated body, `ServerUnauthorized` for a `401` (with the session hint, so
 * a hinted session refreshes in the browser), and an `ApiResponseError`
 * rejection for any other refusal (a `403`/`404` body is the backend's error
 * envelope, as `serverApiPaginate` surfaces it).
 */
export function readMockServerUsers(
  mock: MockAuthConfig,
): PaginatedResponse<User> | ServerUnauthorized {
  const user = parseMockUser(getCookie(MOCK_USER_COOKIE));
  const path = usersContract.paths.list;
  const outcome = respondMockUsers(mock, "get", path, {}, () => user ?? "Access token required!");
  if (outcome?.status === 200) return outcome.body as unknown as PaginatedResponse<User>;
  if (outcome?.status === 401) {
    const unauthorized: ServerUnauthorized = {
      unauthorized: true,
      hasSession: hasServerSessionHint(),
    };
    return unauthorized;
  }
  const status = outcome?.status ?? 404;
  throw toServerApiError(status, outcome?.body, `GET ${path} failed with status ${status}`);
}
