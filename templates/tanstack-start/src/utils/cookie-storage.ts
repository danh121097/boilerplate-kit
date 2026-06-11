const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Read a browser cookie by name. Client-only — returns null on the server. */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Persist a UI preference in a readable cookie (NOT httpOnly — JS owns it) so the
 * SSR server can read it on the next request. `SameSite=Lax` keeps it sent on
 * top-level navigation; 1-year expiry. Client-only — no-op on the server.
 */
export function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
