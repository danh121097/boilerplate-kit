const APP_PREFIX = import.meta.env.VITE_APP_NAME || "PRISM_APP";

/**
 * Centralised cookie key registry for UI preferences. Always go through this map
 * so a single rename ripples cleanly and stale keys are easy to spot.
 *
 * Preferences live in cookies (not localStorage) so SSR can read them on the
 * request — see `utils/cookie-storage` (`readCookie`/`writeCookie`) and the
 * isomorphic LANGUAGE read in `i18n/i18n.ts`. The values here are just the cookie
 * names. (THEME is reserved for a future theme toggle — same cookie mechanism.)
 */
export const STORAGE_KEYS = {
  LANGUAGE: `${APP_PREFIX}_LANGUAGE`,
  THEME: `${APP_PREFIX}_THEME`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
