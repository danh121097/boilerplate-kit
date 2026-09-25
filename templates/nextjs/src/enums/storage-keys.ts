/**
 * App-name prefix for every browser key this app owns, from NEXT_PUBLIC_APP_NAME
 * so multiple deployments on the same origin don't collide. Read it through
 * `getAppPrefix()` (`services/core/app-prefix`) in the service layer.
 */
export const APP_PREFIX =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_APP_NAME || "PRISM_APP" : "PRISM_APP";

/**
 * Centralised key registry. Always go through this map so a single rename
 * ripples cleanly and stale keys are easy to spot.
 *
 * Preferences live in cookies (not localStorage) so SSR can read them on the
 * request — see `utils/cookie-storage` and the root layout's `next/headers` read
 * for LANGUAGE. (THEME is reserved for a future theme toggle.) Auth tokens are
 * httpOnly cookies owned by the backend and never appear here.
 */
export const STORAGE_KEYS = {
  LANGUAGE: `${APP_PREFIX}_LANGUAGE`,
  THEME: `${APP_PREFIX}_THEME`,
  /** Readable (non-httpOnly) "a session exists" hint — see `services/core/session`. */
  SESSION: `${APP_PREFIX}_SESSION`,
  /** localStorage key other tabs watch (`storage` event) for login/logout — see
   * `services/core/session`. */
  AUTH_SYNC: `${APP_PREFIX}_AUTH_SYNC`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
