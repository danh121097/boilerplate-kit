import type { AuthUser } from "@/services/auth/types/auth";

// Dev-only mock auth: where the mock session lives (see `mock-auth.ts`).
// Opaque session tokens — `mock-access|<user>|<nonce>`; the user rides inside so
// `/auth/me` and `/auth/refresh` need no server state.

export const ACCESS_PREFIX = "mock-access|";
export const REFRESH_PREFIX = "mock-refresh|";

let nonce = 0;

export function issueTokens(user: AuthUser) {
  const body = `${encodeURIComponent(JSON.stringify(user))}|${Date.now().toString(36)}${nonce++}`;
  return { accessToken: ACCESS_PREFIX + body, refreshToken: REFRESH_PREFIX + body };
}

function isAuthUser(value: unknown): value is AuthUser {
  const u = value as Partial<AuthUser> | null;
  return (
    typeof u?._id === "string" &&
    typeof u.email === "string" &&
    typeof u.name === "string" &&
    typeof u.role === "string"
  );
}

export function userFromToken(token: unknown, prefix: string): AuthUser | null {
  if (typeof token !== "string" || !token.startsWith(prefix)) return null;
  try {
    const user: unknown = JSON.parse(decodeURIComponent(token.slice(prefix.length).split("|")[0]!));
    return isAuthUser(user) ? user : null;
  } catch {
    return null;
  }
}
