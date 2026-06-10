import { Api, ApiInterceptors } from "./core";
import type { ServiceRefreshConfig } from "./core";

/**
 * Declare every backend the app talks to in one place. Each entry wires a
 * service's base URL and (optionally) its automatic token-refresh endpoint.
 *
 * Auth is cookie-based: the backend sets httpOnly access + refresh token cookies,
 * so there are no localStorage token slots to register — the browser attaches the
 * cookie automatically (the axios client uses `withCredentials`).
 *
 * TanStack Start is SSR-first: this function must only be called on the CLIENT.
 * Server functions that need to call the API forward the request's cookie header
 * directly (see `src/server/`); they do not rely on this client-side registry.
 *
 * Add a backend = add a row + its `VITE_*_API_URL` in `.env` (the URL must include
 * the API prefix, e.g. `http://localhost:3000/api/v1`). Rows with an empty baseURL
 * are skipped. Give a row a `refresh` to enable per-service auto-refresh.
 */
interface ServiceDefinition {
  name: string;
  baseURL: string;
  refresh?: ServiceRefreshConfig;
}

const SERVICES: ServiceDefinition[] = [
  {
    name: "MAIN",
    baseURL: import.meta.env.VITE_API_BASE_URL ?? "https://jsonplaceholder.typicode.com",
    refresh: { endpoint: "/auth/refresh" },
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
