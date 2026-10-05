const DEFAULT_APP_PREFIX = "PRISM_APP";

/**
 * Coerce a raw app name into a SecureStore-legal key prefix: every character
 * outside `[A-Za-z0-9_.-]` (spaces included) becomes `_`, so e.g. "My App" →
 * "My_App". An empty result falls back to the default prefix.
 */
export function sanitizeStorageKeyPrefix(raw: string | undefined): string {
  const cleaned = (raw ?? "").trim().replace(/[^\w.-]/g, "_");
  return cleaned || DEFAULT_APP_PREFIX;
}

// Expo inlines `EXPO_PUBLIC_*` at build time; falls back to a stable default so
// keys are deterministic in tests and when the var is unset.
// Exported so extra storage slots (e.g. a second backend's tokens registered
// via `registerServiceToken`) share the same sanitized app namespace.
export const APP_PREFIX = sanitizeStorageKeyPrefix(process.env.EXPO_PUBLIC_APP_NAME);

/**
 * Centralised storage key registry (keys of the encrypted MMKV instance in
 * `@/services/core/app-storage`). Always go through this map so a single
 * rename ripples cleanly and stale keys are easy to spot.
 *
 * NOTE: MMKV accepts any key; only the prefix is constrained (`[A-Za-z0-9._-]`,
 * sanitized above) because it also names the SecureStore slot of the encryption
 * key. Keep suffixes underscore-only for consistency.
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: `${APP_PREFIX}_ACCESS_TOKEN`,
  REFRESH_TOKEN: `${APP_PREFIX}_REFRESH_TOKEN`,
  LANGUAGE: `${APP_PREFIX}_LANGUAGE`,
  THEME: `${APP_PREFIX}_THEME`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
