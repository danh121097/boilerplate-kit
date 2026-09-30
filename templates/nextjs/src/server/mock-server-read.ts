import { getMockAuth } from "@/services/auth/data/mock-auth-config";
import { MOCK_USER_COOKIE, parseMockUser } from "@/services/auth/data/mock-auth-session";
import { respondMockUsers } from "@/services/users/data/mock-users";
import { cookies } from "next/headers";
import type { MockUsersOutcome } from "@/services/users/data/mock-users";

/**
 * Dev-only mock auth for server reads (`authedFetch` in `server-api.ts`): the
 * SSR counterpart of the browser adapter. The mock session is the readable
 * `MOCK_USER_COOKIE` (no httpOnly access cookie exists without a backend), which
 * the request carries like any cookie. Server-only: it imports `next/headers`.
 *
 * Returns the mock's reply for a path it owns (the users routes), or null when
 * the flag is off or the path is not mocked, so the real fetch runs. Only
 * `server-api.ts` imports it, behind `NODE_ENV !== "production"`, so it is not
 * in a production build.
 */
export async function answerMockServerRead(
  path: string,
  query?: Record<string, string | number>,
): Promise<MockUsersOutcome | null> {
  const mock = getMockAuth();
  if (!mock) return null;
  // `cookies()` already URI-decodes the value, like the browser reader does.
  const user = parseMockUser((await cookies()).get(MOCK_USER_COOKIE)?.value);
  return respondMockUsers(mock, "get", path, query ?? {}, () => user ?? "Access token required!");
}
