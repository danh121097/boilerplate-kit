import { STORAGE_KEYS } from "@/enums";

/**
 * Per-service token registry. Each API service maps to its own pair of
 * localStorage slots — one for the access token (Bearer header) and one for the
 * refresh token (sent in the refresh request body) — so several independently
 * authenticated backends can coexist without colliding.
 *
 * SSR GUARD: All localStorage access is wrapped in `typeof window !== "undefined"`
 * checks. On the server these functions are no-ops / return null — the service
 * layer is client-only; server functions use their own auth context.
 *
 * Most apps only ever need the default MAIN context and touch nothing here.
 * To talk to a second authenticated backend (admin panel, partner API, ...),
 * register its slots once at startup alongside its base URL:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", { access: `${APP_PREFIX}_admin_ACCESS_TOKEN`,
 *                                   refresh: `${APP_PREFIX}_admin_REFRESH_TOKEN` });
 *
 * Security note: storing the refresh token in localStorage makes it readable by
 * JS (and thus by any XSS). The backend also sets an httpOnly refresh cookie; if
 * your threat model needs the stronger guarantee, drop the refresh token from
 * localStorage and rely on the cookie alone.
 */
export interface ServiceTokenKeys {
  access: string;
  refresh: string;
}

const DEFAULT_KEYS: ServiceTokenKeys = {
  access: STORAGE_KEYS.ACCESS_TOKEN,
  refresh: STORAGE_KEYS.REFRESH_TOKEN,
};

const serviceTokenKeys = new Map<string, ServiceTokenKeys>([["MAIN", DEFAULT_KEYS]]);

/** Register (or override) the localStorage slots a service keeps its tokens in. */
export function registerServiceToken(service: string, keys: ServiceTokenKeys): void {
  serviceTokenKeys.set(service, keys);
}

/** Resolve a service to its slot pair, falling back to the MAIN slots. */
function resolveKeys(service: string): ServiceTokenKeys {
  return serviceTokenKeys.get(service) ?? DEFAULT_KEYS;
}

/** SSR-safe localStorage read — returns null on the server. */
export function getAccessToken(service: string = "MAIN"): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(resolveKeys(service).access);
}

/** SSR-safe localStorage write — no-op on the server. */
export function persistAccessToken(token: string, service: string = "MAIN"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(resolveKeys(service).access, token);
}

/** SSR-safe localStorage remove for access token — no-op on the server. */
export function clearAccessToken(service: string = "MAIN"): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(resolveKeys(service).access);
}

/** SSR-safe localStorage read for refresh token — returns null on the server. */
export function getRefreshToken(service: string = "MAIN"): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(resolveKeys(service).refresh);
}

/** SSR-safe localStorage write for refresh token — no-op on the server. */
export function persistRefreshToken(token: string, service: string = "MAIN"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(resolveKeys(service).refresh, token);
}

/** SSR-safe localStorage remove for refresh token — no-op on the server. */
export function clearRefreshToken(service: string = "MAIN"): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(resolveKeys(service).refresh);
}

/** Clear both tokens for a single service (e.g. when its refresh fails). */
export function clearServiceTokens(service: string = "MAIN"): void {
  if (typeof window === "undefined") return;
  const { access, refresh } = resolveKeys(service);
  localStorage.removeItem(access);
  localStorage.removeItem(refresh);
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export function clearAuthTokens(): void {
  if (typeof window === "undefined") return;
  serviceTokenKeys.forEach(({ access, refresh }) => {
    localStorage.removeItem(access);
    localStorage.removeItem(refresh);
  });
}
