import { authContract } from "@/services/auth/contract";
import { initMockAuth } from "@/services/auth/data/mock-auth";
import {
  Api,
  ApiInterceptors,
  getApiBaseUrl,
  markSessionActive,
  setAppPrefix,
} from "@/services/core";
import type { ServiceRefreshConfig } from "@/services/core";

/**
 * Bootstrap the shared `Api` client before any page-level data fetches run.
 * The axios client (and its refresh-and-retry interceptors) serves browser-side
 * reads and mutations; SSR data fetches the backend directly via `serverApiGet`
 * (cookie forwarded, no refresh — see `services/core/server-api.ts`).
 *
 * Declare every backend in `services` below — add a row + its runtimeConfig key
 * (a `NUXT_PUBLIC_*` env var) to wire another authenticated backend. Rows with
 * an empty baseURL are skipped, so optional services stay dormant until set.
 */
export default defineNuxtPlugin(() => {
  // Resolve the app-name prefix (session hint cookie, refresh lock + timestamp)
  // while a Nuxt context exists — same prefix as `useStorageKeys`.
  setAppPrefix(useRuntimeConfig().public.appName);
  // Dev-only mock auth: reads its flag and logs its one boot warning (or why the
  // flag was ignored). Off by default; never active in a production build.
  initMockAuth(useRuntimeConfig().public);

  const services: Array<{
    name: string;
    baseURL: string;
    refresh?: ServiceRefreshConfig;
  }> = [
    {
      name: "MAIN",
      baseURL: getApiBaseUrl(),
      // A 401 is refreshed only while the session hint says a session exists
      // (`hasSession` defaults to `hasSessionHint`; anonymous 401s are final),
      // never for credential endpoints (a login 401 is "wrong password"). A
      // refresh the backend refuses ends the session as "expired" (handled in
      // `04.session-expiry.client.ts`) — the page is never reloaded.
      refresh: {
        onRefreshed: markSessionActive,
        endpoint: authContract.paths.refresh,
        skipPaths: [
          authContract.paths.login,
          authContract.paths.register,
          authContract.paths.logout,
        ],
      },
    },
  ];

  const refreshByService: Record<string, ServiceRefreshConfig> = {};

  for (const svc of services) {
    if (!svc.baseURL) continue;
    Api.setBaseURL(svc.baseURL, svc.name);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }

  // On a 401 the interceptor calls the failing service's own refresh endpoint
  // (the httpOnly refresh cookie is sent automatically); the backend rotates the
  // cookies and the request is replayed. Each service refreshes independently.
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
});
