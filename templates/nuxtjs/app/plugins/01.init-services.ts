import { useStorageKeys } from "@/enums/storage-keys";
import { Api, ApiInterceptors } from "@/services/core";
import { registerServiceToken } from "@/services/core/auth-token-storage";
import type { ServiceRefreshConfig } from "@/services/core";

/**
 * Bootstrap the shared `Api` client before any page-level data fetches run.
 * Runs on BOTH server and client (no `.client`/`.server` suffix); reads service
 * base URLs + appName from runtimeConfig so SSR + CSR resolve the same origins.
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
    tokenKey: () => string;
    refresh?: ServiceRefreshConfig;
  }> = [
    {
      name: "MAIN",
      baseURL: pub.apiBaseUrl || "https://jsonplaceholder.typicode.com",
      tokenKey: () => useStorageKeys("AUTH_TOKEN"),
      refresh: { endpoint: "/auth/refresh" },
    },
  ];

  const refreshByService: Record<string, ServiceRefreshConfig> = {};

  for (const svc of services) {
    if (!svc.baseURL) continue;
    Api.setBaseURL(svc.baseURL, svc.name);
    registerServiceToken(svc.name, svc.tokenKey);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }

  // On a 401 the interceptor calls the failing service's own refresh endpoint
  // (refresh token rides along in its httpOnly cookie), stores the new access
  // token, and replays the request. Each service refreshes independently.
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
});
