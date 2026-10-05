import { STORAGE_KEYS } from "@/enums";
import { getAppStorage } from "@/services/core/app-storage";
import { bumpSessionEpoch, getSessionEpoch } from "@/services/core/session";
import type { ApiService, RefreshedTokens } from "@/services/core/types";

/**
 * Per-service token registry. Each API service maps to its own pair of
 * storage slots — one for the access token (Bearer header) and one for the
 * refresh token (sent in the refresh request body) — so several independently
 * authenticated backends can coexist without colliding.
 *
 * Most apps only ever need the default MAIN context and touch nothing here.
 * To talk to a second authenticated backend (admin panel, partner API, ...),
 * register its slots once at startup alongside its base URL, reusing the
 * sanitized app prefix (`getAppPrefix()`) so the keys stay in the app namespace:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", { access: `${getAppPrefix()}_admin_ACCESS_TOKEN`,
 *                                   refresh: `${getAppPrefix()}_admin_REFRESH_TOKEN` });
 *
 * A service that is not registered fails closed: reads resolve null, writes
 * reject, clears remove nothing. It never touches the MAIN slots, so a MAIN
 * token can never be sent to a second backend's host.
 *
 * Security note: tokens live in the encrypted MMKV instance from `app-storage.ts`
 * (AES-256, sandboxed, not readable by other apps); its encryption key is held in
 * the iOS Keychain / Android Keystore. MMKV is synchronous; every helper below
 * stays `async` as a stable contract (callers await them, and a storage failure
 * — e.g. a locked Keychain on the first access — surfaces as a rejection that
 * callers treat as "tokens unreadable").
 *
 * Slot names are plain MMKV keys; `STORAGE_KEYS` carries the sanitized app-name
 * prefix.
 *
 * Session epoch (owned by `session.ts`): every clear (`clearServiceTokens` /
 * `clearAuthTokens` — the only clear helpers, so no path can skip the bump)
 * bumps the service's epoch synchronously, before the storage is touched. A token
 * refresh only persists the rotated tokens if the epoch is unchanged — so a
 * refresh still in flight when the user logs out (or the session expires) can
 * never resurrect the cleared session.
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

type TokensChangedListener = (service: ApiService) => void;

const tokensChangedListeners = new Set<TokensChangedListener>();

/** Subscribe to token writes and clears (fired once the storage write
 * completed). Returns the unsubscribe. */
export function onTokensChanged(listener: TokensChangedListener): () => void {
  tokensChangedListeners.add(listener);
  return () => {
    tokensChangedListeners.delete(listener);
  };
}

function notifyTokensChanged(service: ApiService): void {
  for (const listener of [...tokensChangedListeners]) listener(service);
}

/** Register (or override) the storage slots a service keeps its tokens in. */
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

export async function getAccessToken(service: string = "MAIN"): Promise<string | null> {
  const keys = resolveKeys(service);
  return keys ? (getAppStorage().getString(keys.access) ?? null) : null;
}

export async function persistAccessToken(token: string, service: string = "MAIN"): Promise<void> {
  const { access } = requireKeys(service);
  getAppStorage().set(access, token);
  notifyTokensChanged(service);
}

export async function getRefreshToken(service: string = "MAIN"): Promise<string | null> {
  const keys = resolveKeys(service);
  return keys ? (getAppStorage().getString(keys.refresh) ?? null) : null;
}

export async function persistRefreshToken(token: string, service: string = "MAIN"): Promise<void> {
  const { refresh } = requireKeys(service);
  getAppStorage().set(refresh, token);
  notifyTokensChanged(service);
}

/** Clear the access token of a single service (the refresh token is kept). */
export async function clearAccessToken(service: string = "MAIN"): Promise<void> {
  bumpSessionEpoch(service);
  const keys = resolveKeys(service);
  if (keys) getAppStorage().remove(keys.access);
  notifyTokensChanged(service);
}

/** Clear the refresh token of a single service (the access token is kept). */
export async function clearRefreshToken(service: string = "MAIN"): Promise<void> {
  bumpSessionEpoch(service);
  const keys = resolveKeys(service);
  if (keys) getAppStorage().remove(keys.refresh);
  notifyTokensChanged(service);
}

/** Clear both tokens for a single service (e.g. when its refresh is refused). */
export async function clearServiceTokens(service: string = "MAIN"): Promise<void> {
  bumpSessionEpoch(service);
  const keys = resolveKeys(service);
  if (keys) {
    const storage = getAppStorage();
    storage.remove(keys.access);
    storage.remove(keys.refresh);
  }
  notifyTokensChanged(service);
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export async function clearAuthTokens(): Promise<void> {
  const services = [...serviceTokenKeys.keys()];
  services.forEach(bumpSessionEpoch);
  const storage = getAppStorage();
  serviceTokenKeys.forEach(({ access, refresh }) => {
    storage.remove(access);
    storage.remove(refresh);
  });
  services.forEach(notifyTokensChanged);
}

/**
 * Persist refreshed tokens only if the service's session was not cleared since
 * `epoch` was read. Returns false (and writes nothing) when the session moved on.
 * The check and the writes are synchronous, so a clear can never land between them.
 */
export async function persistRefreshedTokensIfCurrent(
  tokens: RefreshedTokens,
  epoch: number,
  service: string = "MAIN",
): Promise<boolean> {
  if (getSessionEpoch(service) !== epoch) return false;
  const { access, refresh } = requireKeys(service);
  const storage = getAppStorage();
  storage.set(access, tokens.accessToken);
  if (tokens.refreshToken) storage.set(refresh, tokens.refreshToken);
  notifyTokensChanged(service);
  return true;
}
