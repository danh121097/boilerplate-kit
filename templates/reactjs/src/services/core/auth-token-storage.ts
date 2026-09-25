import { STORAGE_KEYS } from "@/enums";
import { bumpSessionEpoch } from "@/services/core/session";

/**
 * Per-service token registry. Each API service maps to its own pair of
 * localStorage slots — one for the access token (Bearer header) and one for the
 * refresh token (sent in the refresh request body) — so several independently
 * authenticated backends can coexist without colliding.
 *
 * Every clear bumps that service's session epoch (see `session.ts`), so a
 * refresh still in flight when the tokens go cannot write them back.
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

type TokensChangedListener = (service: string) => void;

const tokenListeners = new Set<TokensChangedListener>();

/** Subscribe to token writes/clears made by THIS tab (other tabs' writes arrive
 * as `storage` events instead). Returns the unsubscribe. */
export function onTokensChanged(listener: TokensChangedListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

function notifyTokensChanged(service: string): void {
  for (const listener of tokenListeners) listener(service);
}

/** A slot of `service` was cleared: invalidate its in-flight refreshes, tell listeners. */
function tokensCleared(service: string): void {
  bumpSessionEpoch(service);
  notifyTokensChanged(service);
}

export function getAccessToken(service: string = "MAIN"): string | null {
  return localStorage.getItem(resolveKeys(service).access);
}

export function persistAccessToken(token: string, service: string = "MAIN"): void {
  localStorage.setItem(resolveKeys(service).access, token);
  notifyTokensChanged(service);
}

export function clearAccessToken(service: string = "MAIN"): void {
  localStorage.removeItem(resolveKeys(service).access);
  tokensCleared(service);
}

export function getRefreshToken(service: string = "MAIN"): string | null {
  return localStorage.getItem(resolveKeys(service).refresh);
}

export function persistRefreshToken(token: string, service: string = "MAIN"): void {
  localStorage.setItem(resolveKeys(service).refresh, token);
  notifyTokensChanged(service);
}

export function clearRefreshToken(service: string = "MAIN"): void {
  localStorage.removeItem(resolveKeys(service).refresh);
  tokensCleared(service);
}

/** Clear both tokens for a single service (e.g. when its refresh is refused). */
export function clearServiceTokens(service: string = "MAIN"): void {
  const { access, refresh } = resolveKeys(service);
  localStorage.removeItem(access);
  localStorage.removeItem(refresh);
  tokensCleared(service);
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export function clearAuthTokens(): void {
  serviceTokenKeys.forEach(({ access, refresh }, service) => {
    localStorage.removeItem(access);
    localStorage.removeItem(refresh);
    tokensCleared(service);
  });
}
