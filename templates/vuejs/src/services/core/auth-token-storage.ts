import { STORAGE_KEYS } from "@/enums";

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

/**
 * Per-service session epoch, bumped whenever a service's session is cleared
 * (logout, refused refresh). A refresh captures it before its network call and
 * drops its result if it changed meanwhile, so a refresh still in flight when
 * the user logs out cannot write the tokens back.
 */
const sessionEpochs = new Map<string, number>();

export function getSessionEpoch(service: string = "MAIN"): number {
  return sessionEpochs.get(service) ?? 0;
}

/** Invalidate every refresh started before now: a refresh still in flight persists nothing. */
export function bumpSessionEpoch(service: string = "MAIN"): void {
  sessionEpochs.set(service, getSessionEpoch(service) + 1);
}

/** Per-service count of running logouts — no new refresh may start meanwhile. */
const pendingLogouts = new Map<string, number>();

/** A logout is running for `service`: every new refresh — and every 401 that
 * would trigger one — rejects with `session_ended`. */
export function isLogoutPending(service: string = "MAIN"): boolean {
  return (pendingLogouts.get(service) ?? 0) > 0;
}

/**
 * Mark a logout as running until the returned `done()` is called (idempotent).
 * Call synchronously when logout starts, before any await; logout then bumps
 * the epoch in the same tick it captures the tokens to revoke.
 */
export function beginLogout(service: string = "MAIN"): () => void {
  pendingLogouts.set(service, (pendingLogouts.get(service) ?? 0) + 1);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pendingLogouts.set(service, (pendingLogouts.get(service) ?? 1) - 1);
  };
}

/** Register (or override) the localStorage slots a service keeps its tokens in. */
export function registerServiceToken(service: string, keys: ServiceTokenKeys): void {
  serviceTokenKeys.set(service, keys);
}

/** Resolve a service to its slot pair, falling back to the MAIN slots. */
function resolveKeys(service: string): ServiceTokenKeys {
  return serviceTokenKeys.get(service) ?? DEFAULT_KEYS;
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
  notifyTokensChanged(service);
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
  notifyTokensChanged(service);
}

/** Clear both tokens for a single service (e.g. when its refresh fails). */
export function clearServiceTokens(service: string = "MAIN"): void {
  const { access, refresh } = resolveKeys(service);
  localStorage.removeItem(access);
  localStorage.removeItem(refresh);
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
