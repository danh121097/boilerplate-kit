import { STORAGE_KEYS } from "@/enums";
import { authContract } from "@/services/auth/contract";
import { getMockAuth } from "@/services/auth/data/mock-auth";
import { Api, ApiInterceptors, getApiBaseUrl } from "@/services/core";
import { registerServiceToken } from "@/services/core/auth-token-storage";
import type { ServiceRefreshConfig, ServiceTokenKeys } from "@/services/core";

/**
 * Declare every backend the app talks to in one place. Each entry wires a
 * service's base URL, the localStorage slots its access + refresh tokens live in,
 * and (optionally) its automatic token-refresh endpoint.
 *
 * Add a backend = add a row + its `VITE_*_API_URL` in `.env`. Rows with an empty
 * baseURL are skipped, so optional services stay dormant until their env var is
 * set. Give a row a `refresh` to enable per-service auto-refresh; omit it to opt
 * the service out (its 401s go straight back to the caller).
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
    baseURL: getApiBaseUrl(),
    tokenKeys: { access: STORAGE_KEYS.ACCESS_TOKEN, refresh: STORAGE_KEYS.REFRESH_TOKEN },
    refresh: {
      endpoint: authContract.paths.refresh,
      // A 401 from a credential endpoint (wrong password, ...) is final.
      skipPaths: [authContract.paths.login, authContract.paths.register, authContract.paths.logout],
    },
  },
];

export function initServices(): void {
  // Dev-only mock auth: logs its one boot warning (or why the flag was ignored).
  getMockAuth();

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
  // A refused refresh (401/403) ends that service's session; only the auth
  // service's routes to /login (auth store + root layout) — never a reload.
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
}
