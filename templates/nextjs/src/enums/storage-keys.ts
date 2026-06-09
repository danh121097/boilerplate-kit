/**
 * Centralised localStorage key registry. Always go through this map so a single
 * rename ripples cleanly and stale keys are easy to spot.
 *
 * Keys are prefixed with NEXT_PUBLIC_APP_NAME so multiple deployments of the
 * same app on the same origin don't collide.
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
