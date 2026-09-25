// eslint-disable-next-line no-control-regex -- matching control chars is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const MAX_REDIRECT_LENGTH = 512;

/** `/login`, optionally followed by a trailing slash, `?query` or `#hash`. */
const LOGIN_PATH = /^\/login\/?(?:[?#]|$)/;

/**
 * The post-login destination from a `?redirect=` query value — same-origin
 * paths only. The value is kept only when it is a string of at most 512 chars
 * that starts with exactly one "/" and contains no "\", no control character
 * (URL parsers strip them, so "/\t/evil.test" would become "//evil.test") and
 * no "://", and does not point back at /login. Anything else falls back to
 * `fallback`, so the login page can never be used as an open redirect.
 */
export function safeRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > MAX_REDIRECT_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || CONTROL_CHARS.test(value) || value.includes("://")) return fallback;
  if (LOGIN_PATH.test(value)) return fallback;
  return value;
}
