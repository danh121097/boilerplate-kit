import { Api, ApiInterceptors } from "./core";
import { registerServiceToken } from "./core/auth-token-storage";
import { STORAGE_KEYS } from "@/enums";
import type { ServiceRefreshConfig, ServiceTokenKeys } from "./core";

/**
 * Declare every backend the app talks to in one place. Each entry wires a
 * service's base URL, the localStorage slots its access + refresh tokens live in,
 * and (optionally) its automatic token-refresh endpoint.
 *
 * Add a backend = add a row + its `NEXT_PUBLIC_*_API_URL` in `.env`. Rows with an
 * empty baseURL are skipped, so optional services stay dormant until their env var
 * is set. Give a row a `refresh` to enable per-service auto-refresh; omit it to
 * opt the service out (its 401s just clear that service's tokens).
 *
 * Call initServices() once in the client-side providers tree (app/providers.tsx),
 * not at module scope — localStorage guards require a browser context.
 */
interface ServiceDefinition {
  name: string;
  baseURL: string;
  tokenKeys: ServiceTokenKeys;
  refresh?: ServiceRefreshConfig;
}

const SERVICES: ServiceDefinition[] = [
  {
    name: "MAIN",
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://jsonplaceholder.typicode.com",
    tokenKeys: { access: STORAGE_KEYS.ACCESS_TOKEN, refresh: STORAGE_KEYS.REFRESH_TOKEN },
    refresh: { endpoint: "/auth/refresh" },
  },
];

export function initServices(): void {
  const refreshByService: Record<string, ServiceRefreshConfig> = {};

  for (const svc of SERVICES) {
    if (!svc.baseURL) continue;
    Api.setBaseURL(svc.baseURL, svc.name);
    registerServiceToken(svc.name, svc.tokenKeys);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }

  // On a 401 the interceptor calls the failing service's own refresh endpoint
  // (sending the stored refresh token in the body), stores the new access +
  // refresh tokens, and replays the request. Each service refreshes independently.
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
}
