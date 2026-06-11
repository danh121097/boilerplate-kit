/**
 * Centralised cookie key registry for UI preferences. Always go through this map
 * so a single rename ripples cleanly and stale keys are easy to spot.
 *
 * Preferences live in cookies (not localStorage) so SSR can read them on the
 * request — see `utils/cookie-storage` and the root layout's `next/headers` read
 * for LANGUAGE. Values here are the cookie names, prefixed with NEXT_PUBLIC_APP_NAME
 * so multiple deployments on the same origin don't collide. (THEME is reserved for
 * a future theme toggle; the ACCESS/REFRESH_TOKEN entries are vestigial — auth is
 * httpOnly-cookie-based and never touches these.)
 */
const APP_PREFIX =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_APP_NAME ?? "NEXTJS_APP")
    : "NEXTJS_APP";

export const STORAGE_KEYS = {
  ACCESS_TOKEN: `${APP_PREFIX}_ACCESS_TOKEN`,
  REFRESH_TOKEN: `${APP_PREFIX}_REFRESH_TOKEN`,
  LANGUAGE: `${APP_PREFIX}_LANGUAGE`,
  THEME: `${APP_PREFIX}_THEME`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
