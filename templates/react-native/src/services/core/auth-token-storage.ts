import { STORAGE_KEYS } from "@/enums";
import { bumpSessionEpoch, getSessionEpoch } from "@/services/core/session";
import type { ApiService, RefreshedTokens } from "@/services/core/types";
import * as SecureStore from "expo-secure-store";

/**
 * Per-service token registry. Each API service maps to its own pair of
 * SecureStore slots — one for the access token (Bearer header) and one for the
 * refresh token (sent in the refresh request body) — so several independently
 * authenticated backends can coexist without colliding.
 *
 * Most apps only ever need the default MAIN context and touch nothing here.
 * To talk to a second authenticated backend (admin panel, partner API, ...),
 * register its slots once at startup alongside its base URL, reusing the
 * sanitized app prefix (`getAppPrefix()`) so the keys stay SecureStore-legal:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", { access: `${getAppPrefix()}_admin_ACCESS_TOKEN`,
 *                                   refresh: `${getAppPrefix()}_admin_REFRESH_TOKEN` });
 *
 * A service that is not registered fails closed: reads resolve null, writes
 * reject, clears remove nothing. It never touches the MAIN slots, so a MAIN
 * token can never be sent to a second backend's host.
 *
 * Security note: `expo-secure-store` persists values in the iOS Keychain /
 * Android Keystore — encrypted at rest and not readable by other apps. Reads are
 * async (Promise-returning), which is why every helper below is `async`. Tokens
 * are written with `WHEN_UNLOCKED` accessibility: readable only while the device
 * is unlocked and the app is foregrounded (background refresh is out of scope).
 * SecureStore caps a value at ~2KB on Android — JWTs comfortably fit.
 *
 * SecureStore keys must match `[A-Za-z0-9._-]`; `STORAGE_KEYS` sanitizes the
 * app-name prefix, so its values are always legal.
 *
 * Session epoch (owned by `session.ts`): every clear (`clearServiceTokens` /
 * `clearAuthTokens` — the only clear helpers, so no path can skip the bump)
 * bumps the service's epoch synchronously, before the async delete. A token
 * refresh only persists the rotated tokens if the epoch is unchanged — so a
 * refresh still in flight when the user logs out (or the session expires) can
 * never resurrect the cleared session.
 */
export interface ServiceTokenKeys {
  access: string;
  refresh: string;
}

/** WHEN_UNLOCKED: foreground-only token reads (most secure default). */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

const DEFAULT_KEYS: ServiceTokenKeys = {
  access: STORAGE_KEYS.ACCESS_TOKEN,
  refresh: STORAGE_KEYS.REFRESH_TOKEN,
};

const serviceTokenKeys = new Map<string, ServiceTokenKeys>([["MAIN", DEFAULT_KEYS]]);

type TokensChangedListener = (service: ApiService) => void;

const tokensChangedListeners = new Set<TokensChangedListener>();

/** Subscribe to token writes and clears (fired once the SecureStore write
 * settled). Returns the unsubscribe. */
export function onTokensChanged(listener: TokensChangedListener): () => void {
  tokensChangedListeners.add(listener);
  return () => {
    tokensChangedListeners.delete(listener);
  };
}

function notifyTokensChanged(service: ApiService): void {
  for (const listener of [...tokensChangedListeners]) listener(service);
}

/** Register (or override) the SecureStore slots a service keeps its tokens in. */
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
  return keys ? SecureStore.getItemAsync(keys.access) : null;
}

export async function persistAccessToken(token: string, service: string = "MAIN"): Promise<void> {
  await SecureStore.setItemAsync(requireKeys(service).access, token, SECURE_OPTIONS);
  notifyTokensChanged(service);
}

export async function getRefreshToken(service: string = "MAIN"): Promise<string | null> {
  const keys = resolveKeys(service);
  return keys ? SecureStore.getItemAsync(keys.refresh) : null;
}

export async function persistRefreshToken(token: string, service: string = "MAIN"): Promise<void> {
  await SecureStore.setItemAsync(requireKeys(service).refresh, token, SECURE_OPTIONS);
  notifyTokensChanged(service);
}

/** Clear the access token of a single service (the refresh token is kept). */
export async function clearAccessToken(service: string = "MAIN"): Promise<void> {
  bumpSessionEpoch(service);
  const keys = resolveKeys(service);
  if (keys) await SecureStore.deleteItemAsync(keys.access);
  notifyTokensChanged(service);
}

/** Clear the refresh token of a single service (the access token is kept). */
export async function clearRefreshToken(service: string = "MAIN"): Promise<void> {
  bumpSessionEpoch(service);
  const keys = resolveKeys(service);
  if (keys) await SecureStore.deleteItemAsync(keys.refresh);
  notifyTokensChanged(service);
}

/** Clear both tokens for a single service (e.g. when its refresh is refused). */
export async function clearServiceTokens(service: string = "MAIN"): Promise<void> {
  bumpSessionEpoch(service);
  const keys = resolveKeys(service);
  if (keys) {
    await Promise.all([
      SecureStore.deleteItemAsync(keys.access),
      SecureStore.deleteItemAsync(keys.refresh),
    ]);
  }
  notifyTokensChanged(service);
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export async function clearAuthTokens(): Promise<void> {
  const services = [...serviceTokenKeys.keys()];
  const deletions: Promise<void>[] = [];
  serviceTokenKeys.forEach(({ access, refresh }, service) => {
    bumpSessionEpoch(service);
    deletions.push(SecureStore.deleteItemAsync(access), SecureStore.deleteItemAsync(refresh));
  });
  await Promise.all(deletions);
  services.forEach(notifyTokensChanged);
}

/**
 * Persist refreshed tokens only if the service's session was not cleared since
 * `epoch` was read. Returns false (and writes nothing) when the session moved on.
 * If a clear lands while the writes are in flight, the just-written values are
 * rolled back — compare-and-delete, so tokens from a newer login are never touched.
 * React Native only: SecureStore writes are async, so the epoch can move between
 * the check and the write.
 */
export async function persistRefreshedTokensIfCurrent(
  tokens: RefreshedTokens,
  epoch: number,
  service: string = "MAIN",
): Promise<boolean> {
  if (getSessionEpoch(service) !== epoch) return false;
  const { access, refresh } = requireKeys(service);
  const writes = [SecureStore.setItemAsync(access, tokens.accessToken, SECURE_OPTIONS)];
  if (tokens.refreshToken) {
    writes.push(SecureStore.setItemAsync(refresh, tokens.refreshToken, SECURE_OPTIONS));
  }
  await Promise.all(writes);
  if (getSessionEpoch(service) === epoch) {
    notifyTokensChanged(service);
    return true;
  }

  const rollback = async (key: string, written?: string) => {
    if (written && (await SecureStore.getItemAsync(key)) === written) {
      await SecureStore.deleteItemAsync(key);
    }
  };
  await Promise.all([rollback(access, tokens.accessToken), rollback(refresh, tokens.refreshToken)]);
  return false;
}
