/**
 * Centralised localStorage key registry. Always go through this map so a single
 * rename ripples cleanly and stale keys are easy to spot.
 *
 * Keys are prefixed by `NUXT_PUBLIC_APP_NAME` (resolved via `useRuntimeConfig()`)
 * to namespace this app's keys from anything else on the origin.
 *
 * Resolved lazily inside an accessor — `useRuntimeConfig()` is only valid inside
 * a Nuxt request scope (composable / plugin / setup). Don't read it at module top-level.
 */
function buildKeys(prefix: string) {
  return {
    AUTH_TOKEN: `${prefix}_AUTH_TOKEN`,
    AUX_TOKEN: `${prefix}_AUX_TOKEN`,
    LANGUAGE: `${prefix}_LANGUAGE`,
    THEME: `${prefix}_THEME`,
  } as const;
}

export type StorageKeyMap = ReturnType<typeof buildKeys>;
export type StorageKey = StorageKeyMap[keyof StorageKeyMap];

let cached: StorageKeyMap | null = null;

/** Get the prefix-resolved STORAGE_KEYS map. Safe to call on server or client. */
export function useStorageKeys(): StorageKeyMap {
  if (cached) return cached;
  const prefix = useRuntimeConfig().public.appName || "PRISM_APP";
  cached = buildKeys(prefix);
  return cached;
}
