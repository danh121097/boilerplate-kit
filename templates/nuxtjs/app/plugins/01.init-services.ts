import { Api, ApiInterceptors } from "@/services/core";

/**
 * Bootstrap the shared `Api` client before any page-level data fetches run.
 * Runs on BOTH server and client (no `.client`/`.server` suffix); reads
 * baseURL + appName from runtimeConfig so SSR + CSR see the same origin.
 */
export default defineNuxtPlugin(() => {
  const { public: pub } = useRuntimeConfig();
  Api.setBaseURL(pub.apiBaseUrl || "https://jsonplaceholder.typicode.com", "MAIN");
  Api.registerInterceptors(new ApiInterceptors());
});
