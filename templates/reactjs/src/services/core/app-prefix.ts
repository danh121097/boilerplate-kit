import { APP_PREFIX } from "@/enums";

/**
 * App-name prefix for the browser storage this service layer owns: the token
 * slots (`${prefix}_ACCESS_TOKEN`, `${prefix}_REFRESH_TOKEN`) and the cross-tab
 * refresh lock (`${prefix}:auth-refresh:${service}`), so several apps on one
 * origin never share them. Comes from `VITE_APP_NAME` (default `PRISM_APP`).
 */
export function getAppPrefix(): string {
  return APP_PREFIX;
}
