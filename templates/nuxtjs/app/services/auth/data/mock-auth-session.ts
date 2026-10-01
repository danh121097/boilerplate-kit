import { getAppPrefix } from "@/services/core/app-prefix";
import type { AuthUser } from "@/services/auth/types/auth";
import type { Role } from "@/services/users/types/user";

// Dev-only mock auth: where the mock session lives (see `mock-auth.ts`).
// The mock session — the signed-in user in a readable cookie, standing in for the
// httpOnly token cookies a backend would set.

/** Name of the cookie holding the mock session's user (JSON). Same 7-day life as the hint. */
const mockUserCookie = () => `${getAppPrefix()}_MOCK_USER`;
const MOCK_USER_MAX_AGE = 7 * 24 * 60 * 60;

/** Access token a login returns in its body — opaque; nothing reads it back. */
export const MOCK_ACCESS_TOKEN = "mock-access";

const ROLES: readonly string[] = ["user", "admin", "super_admin"] satisfies Role[];

function isAuthUser(value: unknown): value is AuthUser {
  const u = value as Partial<AuthUser> | null;
  return (
    typeof u?._id === "string" &&
    typeof u.email === "string" &&
    typeof u.name === "string" &&
    typeof u.role === "string" &&
    ROLES.includes(u.role) &&
    typeof u.isActive === "boolean" &&
    typeof u.createdAt === "string" &&
    typeof u.updatedAt === "string"
  );
}

function parseMockUser(raw: string | null | undefined): AuthUser | null {
  if (!raw) return null;
  try {
    const user: unknown = JSON.parse(raw);
    return isAuthUser(user) ? user : null;
  } catch {
    return null;
  }
}

/** The value of cookie `name` in a cookie string, URI-decoded (null when absent). */
function cookieValue(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

export function readMockUser(): AuthUser | null {
  if (typeof document === "undefined") return null;
  return parseMockUser(cookieValue(document.cookie, mockUserCookie()));
}

export function writeMockUser(user: AuthUser | null): void {
  if (typeof document === "undefined") return;
  const value = user ? encodeURIComponent(JSON.stringify(user)) : "";
  const maxAge = user ? MOCK_USER_MAX_AGE : 0;
  document.cookie = `${mockUserCookie()}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * SSR: the mock session's user from the incoming request's cookie header, else
 * null. Call inside the request's Nuxt context (before any `await`), like
 * `hasServerSessionHint`.
 */
export function readMockServerUser(): AuthUser | null {
  try {
    return parseMockUser(cookieValue(useRequestHeaders(["cookie"]).cookie, mockUserCookie()));
  } catch {
    return null;
  }
}
