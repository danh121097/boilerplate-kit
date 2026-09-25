/** Where sign-in lands when there is no (valid) return path. */
export const DEFAULT_RETURN_PATH = "/";

const MAX_RETURN_PATH_LENGTH = 512;

/**
 * Validate a `returnTo` route param (untrusted: it can arrive via a deep link)
 * and fall back to home. Only in-app expo-router paths pass:
 * - a single leading "/" (rejects "//host", "/\host" and anything with a scheme);
 * - no backslash anywhere;
 * - no control characters, bounded length;
 * - never the login screen itself (would loop).
 */
export function safeReturnPath(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.length > MAX_RETURN_PATH_LENGTH) {
    return DEFAULT_RETURN_PATH;
  }
  // eslint-disable-next-line no-control-regex
  if (!/^\/(?![/\\])/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    return DEFAULT_RETURN_PATH;
  }
  if (value.includes("\\") || value.includes("://")) return DEFAULT_RETURN_PATH;
  const path = value.split(/[?#]/)[0] ?? "";
  if (path === "/login" || path.startsWith("/login/")) return DEFAULT_RETURN_PATH;
  return value;
}
