import { STORAGE_KEYS } from "@/enums";
import { authContract } from "@/services/auth/contract";
import { Api, ApiInterceptors, getApiBaseUrl } from "@/services/core";
import { registerServiceToken } from "@/services/core/auth-token-storage";
import type {
  ServiceRefreshConfig,
  ServiceTokenKeys,
  SessionExpiredHandler,
} from "@/services/core";

/**
 * Declare every backend the app talks to in one place. Each entry wires a
 * service's base URL, the SecureStore slots its access + refresh tokens live in,
 * and (optionally) its automatic token-refresh endpoint.
 *
 * Add a backend = add a row + its `EXPO_PUBLIC_*_API_URL` in `.env`. Rows with an
 * empty baseURL are skipped, so optional services stay dormant until their env var
 * is set. Give a row a `refresh` to enable per-service auto-refresh; omit it to
 * opt the service out (its 401s just clear that service's tokens).
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
    refresh: { endpoint: authContract.paths.refresh },
  },
];

/**
 * Wire axios base URLs + interceptors. Called once from the root layout.
 *
 * @param onSessionExpired Invoked when a service's session is unrecoverable (a
 * non-refreshable 401 or a failed refresh). The app passes a handler that clears
 * the auth store and navigates to `/login` — this replaces the web template's
 * `window.location.reload()` (there is no `window` on React Native). The handler
 * is passed in (not imported) so `init-services` stays free of a store/router
 * import cycle.
 */
export function initServices(onSessionExpired?: SessionExpiredHandler): void {
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
  Api.registerInterceptors(new ApiInterceptors(refreshByService, onSessionExpired));
}
