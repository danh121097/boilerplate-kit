/**
 * Centralised cookie key registry for UI preferences. Always go through this map
 * so a single rename ripples cleanly and stale keys are easy to spot.
 *
 * Preferences live in cookies (not localStorage) so SSR can read them on the
 * request. LANGUAGE is managed by `@nuxtjs/i18n` (`detectBrowserLanguage.useCookie`
 * with `cookieKey: ${APP_NAME}_LANGUAGE` in `nuxt.config.ts`); THEME is reserved
 * for a future theme toggle (use a cookie so SSR can read it too).
 *
 * Keys are prefixed by `NUXT_PUBLIC_APP_NAME` (resolved via `useRuntimeConfig()`)
 * to namespace this app's keys from anything else on the origin.
 *
 * Resolved lazily inside an accessor — `useRuntimeConfig()` is only valid inside
 * a Nuxt request scope (composable / plugin / setup). Don't read it at module top-level.
 */
function buildKeys(prefix: string) {
  // Auth tokens are NOT stored client-side (cookie-first httpOnly auth) — no token keys here.
  return {
    LANGUAGE: `${prefix}_LANGUAGE`,
    THEME: `${prefix}_THEME`,
  } as const;
}

export type StorageKeyMap = ReturnType<typeof buildKeys>;
export type StorageKey = StorageKeyMap[keyof StorageKeyMap];

let cached: StorageKeyMap | null = null;

/**
 * Resolve a single prefixed storage key by name, e.g. `useStorageKeys("LANGUAGE")`.
 * The `name` param autocompletes to the keys declared in `buildKeys`. Safe to
 * call on server or client (the prefix map is resolved lazily and cached).
 */
export function useStorageKeys(name: keyof StorageKeyMap): string {
  if (!cached) {
    const prefix = useRuntimeConfig().public.appName || "PRISM_APP";
    cached = buildKeys(prefix);
  }
  return cached[name];
}
