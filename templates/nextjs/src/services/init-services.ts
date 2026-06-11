import { authContract } from "./auth/contract";
import { Api, ApiInterceptors, getApiBaseUrl } from "./core";
import type { ServiceRefreshConfig } from "./core";

/**
 * Declare every backend the app talks to in one place (base URL + optional
 * auto-refresh endpoint). Cookie-based auth → no localStorage token slots. Call
 * on the CLIENT only; server functions forward the request cookie directly.
 *
 * Add a backend = a row + its endpoint env; `getApiBaseUrl()` appends the
 * `/api/v1` prefix to `NEXT_PUBLIC_APP_ENDPOINT`. Empty-baseURL rows are skipped.
 */
interface ServiceDefinition {
  name: string;
  baseURL: string;
  refresh?: ServiceRefreshConfig;
}

const SERVICES: ServiceDefinition[] = [
  {
    name: "MAIN",
    baseURL: getApiBaseUrl(),
    // reloadOnFailure: true — most endpoints need auth, so a failed refresh means
    // the session is truly dead → reload to a clean (logged-out) state.
    refresh: { endpoint: authContract.paths.refresh, reloadOnFailure: true },
  },
];

export function initServices(): void {
  const refreshByService: Record<string, ServiceRefreshConfig> = {};

  for (const svc of SERVICES) {
    if (!svc.baseURL) continue;
    Api.setBaseURL(svc.baseURL, svc.name);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }

  // On a 401 the interceptor calls the failing service's own refresh endpoint
  // (the httpOnly refresh cookie is sent automatically); the backend rotates the
  // cookies and the request is replayed. Each service refreshes independently.
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
}
