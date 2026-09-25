/**
 * App-name prefix for the browser storage this service layer owns (the session
 * hint cookie, the cross-tab refresh lock and timestamp) — the same
 * `NUXT_PUBLIC_APP_NAME` prefix `useStorageKeys` uses, so several apps on one
 * origin never share them. Set once at boot by `01.init-services.ts`; kept in
 * module state so it is readable outside a Nuxt context (interceptors).
 */
const DEFAULT_PREFIX = "PRISM_APP";

let prefix = DEFAULT_PREFIX;

export function setAppPrefix(value: string | undefined): void {
  prefix = value || DEFAULT_PREFIX;
}

export function getAppPrefix(): string {
  return prefix;
}
