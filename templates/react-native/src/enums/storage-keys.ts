// Expo inlines `EXPO_PUBLIC_*` at build time; falls back to a stable default so
// keys are deterministic in tests and when the var is unset.
const APP_PREFIX = process.env.EXPO_PUBLIC_APP_NAME || "PRISM_APP";

/**
 * Centralised SecureStore key registry. Always go through this map so a single
 * rename ripples cleanly and stale keys are easy to spot.
 *
 * NOTE: `expo-secure-store` keys must match `[A-Za-z0-9._-]`. Every value here is
 * underscore-only, so it is already SecureStore-legal — keep it that way when
 * adding keys (no spaces, slashes, or other punctuation).
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: `${APP_PREFIX}_ACCESS_TOKEN`,
  REFRESH_TOKEN: `${APP_PREFIX}_REFRESH_TOKEN`,
  LANGUAGE: `${APP_PREFIX}_LANGUAGE`,
  THEME: `${APP_PREFIX}_THEME`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
