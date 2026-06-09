import { useStorageKeys } from "@/enums/storage-keys";

/**
 * Browser localStorage token registry. All reads/writes are SSR-guarded —
 * during server rendering they no-op (`getAccessToken` returns `null`,
 * mutations are silently skipped).
 *
 * Per-service design: each API service maps to its own PAIR of storage slots
 * (access + refresh) via lazy resolvers (the slot names depend on the runtime
 * app prefix, only knowable inside a Nuxt request scope). Most apps only need
 * the default MAIN context. To talk to a second authenticated backend:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", {
 *     access: () => `${useRuntimeConfig().public.appName}_ADMIN_ACCESS_TOKEN`,
 *     refresh: () => `${useRuntimeConfig().public.appName}_ADMIN_REFRESH_TOKEN`,
 *   });
 *
 * Security note: storing the refresh token in localStorage makes it readable by
 * JS (and thus by any XSS). The backend also sets an httpOnly refresh cookie; if
 * your threat model needs the stronger guarantee, drop the refresh token from
 * localStorage and rely on the cookie alone.
 */

type TokenKeyResolver = () => string;

/** Pair of lazy key resolvers — one for the access token, one for the refresh token. */
export interface ServiceTokenKeys {
  access: TokenKeyResolver;
  refresh: TokenKeyResolver;
}

const DEFAULT_KEYS: ServiceTokenKeys = {
  access: () => useStorageKeys("ACCESS_TOKEN"),
  refresh: () => useStorageKeys("REFRESH_TOKEN"),
};

const serviceTokenKeys = new Map<string, ServiceTokenKeys>([["MAIN", DEFAULT_KEYS]]);

/** Register (or override) the storage slots a service keeps its tokens in. */
export function registerServiceToken(service: string, keys: ServiceTokenKeys): void {
  serviceTokenKeys.set(service, keys);
}

/** Resolve a service to its slot pair, falling back to the MAIN slots. */
function resolveKeys(service: string): ServiceTokenKeys {
  return serviceTokenKeys.get(service) ?? DEFAULT_KEYS;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

// ---------------------------------------------------------------------------
// Access token
// ---------------------------------------------------------------------------

export function getAccessToken(service: string = "MAIN"): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(resolveKeys(service).access());
}

export function persistAccessToken(token: string, service: string = "MAIN"): void {
  if (!isClient()) return;
  localStorage.setItem(resolveKeys(service).access(), token);
}

export function clearAccessToken(service: string = "MAIN"): void {
  if (!isClient()) return;
  localStorage.removeItem(resolveKeys(service).access());
}

// ---------------------------------------------------------------------------
// Refresh token
// ---------------------------------------------------------------------------

export function getRefreshToken(service: string = "MAIN"): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(resolveKeys(service).refresh());
}

export function persistRefreshToken(token: string, service: string = "MAIN"): void {
  if (!isClient()) return;
  localStorage.setItem(resolveKeys(service).refresh(), token);
}

export function clearRefreshToken(service: string = "MAIN"): void {
  if (!isClient()) return;
  localStorage.removeItem(resolveKeys(service).refresh());
}

// ---------------------------------------------------------------------------
// Bulk clear helpers
// ---------------------------------------------------------------------------

/** Clear BOTH tokens for a single service (e.g. when its refresh fails). */
export function clearServiceTokens(service: string = "MAIN"): void {
  if (!isClient()) return;
  const { access, refresh } = resolveKeys(service);
  localStorage.removeItem(access());
  localStorage.removeItem(refresh());
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export function clearAuthTokens(): void {
  if (!isClient()) return;
  serviceTokenKeys.forEach(({ access, refresh }) => {
    localStorage.removeItem(access());
    localStorage.removeItem(refresh());
  });
}
