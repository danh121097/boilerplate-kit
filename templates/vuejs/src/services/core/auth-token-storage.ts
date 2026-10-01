import { STORAGE_KEYS } from "@/enums";
import { bumpSessionEpoch } from "@/services/core/session";

/**
 * Per-service token registry. Each API service maps to its own pair of
 * localStorage slots — one for the access token (Bearer header) and one for the
 * refresh token (sent in the refresh request body) — so several independently
 * authenticated backends can coexist without colliding.
 *
 * Most apps only ever need the default MAIN context and touch nothing here.
 * To talk to a second authenticated backend (admin panel, partner API, ...),
 * register its slots once at startup alongside its base URL:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", { access: `${APP_PREFIX}_admin_ACCESS_TOKEN`,
 *                                   refresh: `${APP_PREFIX}_admin_REFRESH_TOKEN` });
 *
 * A service that is not registered fails closed: reads return null, writes
 * throw, clears remove nothing. It never touches the MAIN slots.
 *
 * Every clear bumps that service's session epoch (`session.ts`), so a refresh
 * still in flight when the tokens go cannot write them back.
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

/** localStorage is not reactive — writers notify here so UI state (the auth
 * store's `isAuthenticated`) can mirror token presence. */
type TokenChangeListener = (service: string) => void;
const tokenListeners = new Set<TokenChangeListener>();

/** Subscribe to token writes/clears for any service; returns an unsubscribe. */
export function onTokensChanged(listener: TokenChangeListener): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

function notifyTokensChanged(service: string): void {
  tokenListeners.forEach((listener) => listener(service));
}

/** Register (or override) the localStorage slots a service keeps its tokens in. */
export function registerServiceToken(service: string, keys: ServiceTokenKeys): void {
  serviceTokenKeys.set(service, keys);
}

/** The slot pair of a registered service, else undefined (never the MAIN slots). */
function resolveKeys(service: string): ServiceTokenKeys | undefined {
  return serviceTokenKeys.get(service);
}

function requireKeys(service: string): ServiceTokenKeys {
  const keys = resolveKeys(service);
  if (!keys) {
    throw new Error(
      `[auth] No token slots registered for service "${service}"; call registerServiceToken first.`,
    );
  }
  return keys;
}

export function getAccessToken(service: string = "MAIN"): string | null {
  const keys = resolveKeys(service);
  return keys ? localStorage.getItem(keys.access) : null;
}

export function persistAccessToken(token: string, service: string = "MAIN"): void {
  localStorage.setItem(requireKeys(service).access, token);
  notifyTokensChanged(service);
}

export function clearAccessToken(service: string = "MAIN"): void {
  const keys = resolveKeys(service);
  if (keys) localStorage.removeItem(keys.access);
  bumpSessionEpoch(service);
  notifyTokensChanged(service);
}

export function getRefreshToken(service: string = "MAIN"): string | null {
  const keys = resolveKeys(service);
  return keys ? localStorage.getItem(keys.refresh) : null;
}

export function persistRefreshToken(token: string, service: string = "MAIN"): void {
  localStorage.setItem(requireKeys(service).refresh, token);
  notifyTokensChanged(service);
}

export function clearRefreshToken(service: string = "MAIN"): void {
  const keys = resolveKeys(service);
  if (keys) localStorage.removeItem(keys.refresh);
  bumpSessionEpoch(service);
  notifyTokensChanged(service);
}

/** Clear both tokens for a single service (e.g. when its refresh fails). */
export function clearServiceTokens(service: string = "MAIN"): void {
  const keys = resolveKeys(service);
  if (keys) {
    localStorage.removeItem(keys.access);
    localStorage.removeItem(keys.refresh);
  }
  bumpSessionEpoch(service);
  notifyTokensChanged(service);
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export function clearAuthTokens(): void {
  serviceTokenKeys.forEach(({ access, refresh }, service) => {
    localStorage.removeItem(access);
    localStorage.removeItem(refresh);
    bumpSessionEpoch(service);
    notifyTokensChanged(service);
  });
}
