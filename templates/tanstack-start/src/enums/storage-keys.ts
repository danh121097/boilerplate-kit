const APP_PREFIX = import.meta.env.VITE_APP_NAME || "PRISM_APP";

/**
 * Centralised localStorage key registry. Always go through this map so a single
 * rename ripples cleanly and stale keys are easy to spot.
 *
 * SSR note: localStorage is browser-only. Any code that reads STORAGE_KEYS at
 * module evaluation time is safe — these are just string constants. The actual
 * localStorage.getItem/setItem calls must be guarded by typeof window checks.
 */
export const STORAGE_KEYS = {
  // Auth tokens are NOT stored here — they live in httpOnly cookies set by the
  // backend (cookie-based auth). Only non-sensitive UI prefs are persisted.
  LANGUAGE: `${APP_PREFIX}_LANGUAGE`,
  THEME: `${APP_PREFIX}_THEME`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
