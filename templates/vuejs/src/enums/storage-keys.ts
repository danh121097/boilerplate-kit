const APP_PREFIX = import.meta.env.VITE_APP_NAME || "PRISM_APP";

/**
 * Centralised localStorage key registry. Always go through this map so a single
 * rename ripples cleanly and stale keys are easy to spot.
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: `${APP_PREFIX}_ACCESS_TOKEN`,
  REFRESH_TOKEN: `${APP_PREFIX}_REFRESH_TOKEN`,
  LANGUAGE: `${APP_PREFIX}_LANGUAGE`,
  THEME: `${APP_PREFIX}_THEME`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
