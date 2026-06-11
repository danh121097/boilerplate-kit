import { authContract } from "@/services/auth/contract";
import { Api, ApiInterceptors } from "@/services/core";
import type { ServiceRefreshConfig } from "@/services/core";

/**
 * Bootstrap the shared `Api` client before any page-level data fetches run.
 * Runs client-only (.client suffix) — the axios interceptors are browser-side;
 * SSR data fetches the backend directly via `serverApiGet` (cookie forwarded).
 *
 * Declare every backend in `services` below — add a row + its runtimeConfig key
 * (a `NUXT_PUBLIC_*` env var) to wire another authenticated backend. Rows with
 * an empty baseURL are skipped, so optional services stay dormant until set.
 */
export default defineNuxtPlugin(() => {
  const { public: pub } = useRuntimeConfig();

  const services: Array<{
    name: string;
    baseURL: string;
    refresh?: ServiceRefreshConfig;
  }> = [
    {
      name: "MAIN",
      baseURL: pub.apiBaseUrl || "https://jsonplaceholder.typicode.com",
      // reloadOnFailure: true — most endpoints need auth, so a failed refresh means
      // the session is truly dead → reload to a clean (logged-out) state.
      refresh: { endpoint: authContract.paths.refresh, reloadOnFailure: true },
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
