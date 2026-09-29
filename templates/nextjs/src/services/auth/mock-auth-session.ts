import { APP_PREFIX } from "@/enums";
import { readCookie } from "@/utils/cookie-storage";
import type { AuthUser } from "@/services/auth/types/auth";

// Dev-only mock auth: where the mock session lives (see `mock-auth.ts`).
// The mock session — the signed-in user in a readable cookie, standing in for the
// httpOnly token cookies a backend would set.

/** Cookie holding the mock session's user (JSON). Same 7-day life as the hint. */
const MOCK_USER_COOKIE = `${APP_PREFIX}_MOCK_USER`;
const MOCK_USER_MAX_AGE = 7 * 24 * 60 * 60;

/** Access token a login returns in its body — opaque; nothing reads it back. */
export const MOCK_ACCESS_TOKEN = "mock-access";

function isAuthUser(value: unknown): value is AuthUser {
  const u = value as Partial<AuthUser> | null;
  return (
    typeof u?._id === "string" &&
    typeof u.email === "string" &&
    typeof u.name === "string" &&
    typeof u.role === "string"
  );
}

/** The user in a `MOCK_USER_COOKIE` value (already URI-decoded), else null. */
export function parseMockUser(raw: string | null | undefined): AuthUser | null {
  if (!raw) return null;
  try {
    const user: unknown = JSON.parse(raw);
    return isAuthUser(user) ? user : null;
  } catch {
    return null;
  }
}

export function writeMockUser(user: AuthUser | null): void {
  if (typeof document === "undefined") return;
  const value = user ? encodeURIComponent(JSON.stringify(user)) : "";
  const maxAge = user ? MOCK_USER_MAX_AGE : 0;
  document.cookie = `${MOCK_USER_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** The mock session's user from the browser's cookies, else null. */
export function readMockUser(): AuthUser | null {
  return parseMockUser(readCookie(MOCK_USER_COOKIE));
}
