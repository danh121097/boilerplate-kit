import { Api, ApiInterceptors } from "./core";
import { registerServiceToken } from "./core/auth-token-storage";
import { STORAGE_KEYS } from "@/enums";
import type { ServiceRefreshConfig } from "./core";

/**
 * Declare every backend the app talks to in one place. Each entry wires a
 * service's base URL, the localStorage slot its bearer token lives in, and
 * (optionally) its automatic token-refresh endpoint.
 *
 * Add a backend = add a row + its `VITE_*_API_URL` in `.env`. Rows with an empty
 * baseURL are skipped, so optional services stay dormant until their env var is
 * set. Give a row a `refresh` to enable per-service auto-refresh; omit it to opt
 * the service out (its 401s just clear that service's token).
 */
interface ServiceDefinition {
  name: string;
  baseURL: string;
  tokenKey: string;
  refresh?: ServiceRefreshConfig;
}

const SERVICES: ServiceDefinition[] = [
  {
    name: "MAIN",
    baseURL: import.meta.env.VITE_API_BASE_URL ?? "https://jsonplaceholder.typicode.com",
    tokenKey: STORAGE_KEYS.AUTH_TOKEN,
    refresh: { endpoint: "/auth/refresh" },
  },
];

export function initServices(): void {
  const refreshByService: Record<string, ServiceRefreshConfig> = {};

  for (const svc of SERVICES) {
    if (!svc.baseURL) continue;
    Api.setBaseURL(svc.baseURL, svc.name);
    registerServiceToken(svc.name, svc.tokenKey);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }

  // On a 401 the interceptor calls the failing service's own refresh endpoint
  // (refresh token rides along in its httpOnly cookie), stores the new access
  // token, and replays the request. Each service refreshes independently.
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
}
