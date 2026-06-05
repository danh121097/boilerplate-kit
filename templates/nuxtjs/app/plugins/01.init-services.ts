import { Api, ApiInterceptors } from "@/services/core";
import { registerServiceToken } from "@/services/core/auth-token-storage";
import { useStorageKeys } from "@/enums/storage-keys";

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

  const services = [
    {
      name: "MAIN",
      baseURL: pub.apiBaseUrl || "https://jsonplaceholder.typicode.com",
      tokenKey: () => useStorageKeys("AUTH_TOKEN"),
    },
  ];

  for (const svc of services) {
    if (!svc.baseURL) continue;
    Api.setBaseURL(svc.baseURL, svc.name);
    registerServiceToken(svc.name, svc.tokenKey);
  }
  Api.registerInterceptors(new ApiInterceptors());
});
