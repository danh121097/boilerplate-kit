import { APP_PREFIX } from "@/enums";

/**
 * App-name prefix for the browser storage this service layer owns (token keys,
 * the cross-tab refresh lock) — `VITE_APP_NAME`, default "PRISM_APP", so several
 * apps on one origin never share them.
 */
export function getAppPrefix(): string {
  return APP_PREFIX;
}
