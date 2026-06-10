import { authContract } from "./auth/contract";
import { Api, ApiInterceptors } from "./core";
import type { ServiceRefreshConfig } from "./core";

/**
 * Declare every backend the app talks to in one place (base URL + optional
 * auto-refresh endpoint). Cookie-based auth → no localStorage token slots. Call
 * on the CLIENT only; server functions forward the request cookie directly.
 *
 * Add a backend = a row + its `VITE_*_API_URL` in `.env` (URL includes the API
 * prefix, e.g. `http://localhost:3000/api/v1`); empty-baseURL rows are skipped.
 */
interface ServiceDefinition {
  name: string;
  baseURL: string;
  refresh?: ServiceRefreshConfig;
}

const SERVICES: ServiceDefinition[] = [
  {
    name: "MAIN",
    baseURL: import.meta.env.VITE_API_BASE_URL,
    // reloadOnFailure: true — most endpoints need auth, so a failed refresh means
    // the session is truly dead → reload to a clean (logged-out) state. Safe here:
    // client axios calls are gated behind auth and the session bootstrap runs via
    // server functions (not this interceptor). If you add a PUBLIC client call that
    // fires for anonymous users, gate it or it will 401→refresh→reload loop.
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
