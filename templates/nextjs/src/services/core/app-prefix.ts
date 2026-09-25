import { APP_PREFIX } from "@/enums";

/**
 * App-name prefix for the browser storage this service layer owns (the session
 * hint cookie, the cross-tab auth-sync key, the refresh lock and its "last
 * refresh" stamp), so several apps on one origin never share them. Comes from
 * `NEXT_PUBLIC_APP_NAME` (inlined at build time, so SSR and the browser agree),
 * default `PRISM_APP`.
 */
export function getAppPrefix(): string {
  return APP_PREFIX;
}
