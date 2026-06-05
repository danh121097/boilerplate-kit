import { STORAGE_KEYS } from "@/enums";

/**
 * Per-service auth-token registry. Each API service maps to its own
 * localStorage slot, so several independently-authenticated backends can
 * coexist without colliding.
 *
 * Most apps only ever need the default MAIN context and touch nothing here.
 * To talk to a second authenticated backend (admin panel, partner API, ...),
 * register its slot once at startup alongside its base URL:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", `${APP_PREFIX}_ADMIN_TOKEN`);
 */
const serviceTokenKeys = new Map<string, string>([["MAIN", STORAGE_KEYS.AUTH_TOKEN]]);

/** Register (or override) the localStorage slot a service keeps its token in. */
export function registerServiceToken(service: string, storageKey: string): void {
  serviceTokenKeys.set(service, storageKey);
}

/** Resolve a service to its storage slot, falling back to the MAIN slot. */
function resolveTokenKey(service: string): string {
  return serviceTokenKeys.get(service) ?? STORAGE_KEYS.AUTH_TOKEN;
}

export function getAuthToken(service: string = "MAIN"): string | null {
  return localStorage.getItem(resolveTokenKey(service));
}

export function persistAuthToken(token: string, service: string = "MAIN"): void {
  localStorage.setItem(resolveTokenKey(service), token);
}

/** Clear every registered service's token (e.g. on logout / 401). */
export function clearAuthTokens(): void {
  serviceTokenKeys.forEach((key) => localStorage.removeItem(key));
}
