import { authContract } from "@/services/auth/contract";
import { getMockAuth } from "@/services/auth/mock-auth";
import {
  Api,
  ApiInterceptors,
  getApiBaseUrl,
  hasSessionHint,
  markSessionActive,
} from "@/services/core";
import type { ServiceRefreshConfig } from "@/services/core";

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
    // A 401 is refreshed only while the session hint says a session exists
    // (anonymous 401s are final), never for credential endpoints (a login 401 is
    // "wrong password"), a successful refresh renews the hint, and a refused
    // refresh ends the session — no page reload.
    refresh: {
      endpoint: authContract.paths.refresh,
      skipPaths: [authContract.paths.login, authContract.paths.register, authContract.paths.logout],
      hasSession: hasSessionHint,
      onRefreshed: markSessionActive,
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
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }

  // On a 401 the interceptor calls the failing service's own refresh endpoint
  // (the httpOnly refresh cookie is sent automatically); the backend rotates the
  // cookies and the request is replayed. Each service refreshes independently.
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
}
