import { STORAGE_KEYS } from "@/enums";
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
 * sanitized `APP_PREFIX` from `@/enums` so the keys stay SecureStore-legal:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", { access: `${APP_PREFIX}_admin_ACCESS_TOKEN`,
 *                                   refresh: `${APP_PREFIX}_admin_REFRESH_TOKEN` });
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
 * Session epoch: every clear (`clearServiceTokens` / `clearAuthTokens` — the
 * only clear helpers, so no path can skip the bump) bumps a per-service counter. A token refresh reads
 * the epoch before its network call and only persists the rotated tokens if the
 * epoch is unchanged — so a refresh still in flight when the user logs out (or
 * the session expires) can never resurrect the cleared session.
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

/** In-memory per-service session epoch; bumped synchronously on every clear. */
const sessionEpochs = new Map<string, number>();

/** Current session epoch for a service (0 until its tokens are first cleared). */
export function getSessionEpoch(service: string = "MAIN"): number {
  return sessionEpochs.get(service) ?? 0;
}

function bumpSessionEpoch(service: string): void {
  sessionEpochs.set(service, getSessionEpoch(service) + 1);
}

/** Register (or override) the SecureStore slots a service keeps its tokens in. */
export function registerServiceToken(service: string, keys: ServiceTokenKeys): void {
  serviceTokenKeys.set(service, keys);
}

/** Resolve a service to its slot pair, falling back to the MAIN slots. */
function resolveKeys(service: string): ServiceTokenKeys {
  return serviceTokenKeys.get(service) ?? DEFAULT_KEYS;
}

export function getAccessToken(service: string = "MAIN"): Promise<string | null> {
  return SecureStore.getItemAsync(resolveKeys(service).access);
}

export function persistAccessToken(token: string, service: string = "MAIN"): Promise<void> {
  return SecureStore.setItemAsync(resolveKeys(service).access, token, SECURE_OPTIONS);
}

export function getRefreshToken(service: string = "MAIN"): Promise<string | null> {
  return SecureStore.getItemAsync(resolveKeys(service).refresh);
}

export function persistRefreshToken(token: string, service: string = "MAIN"): Promise<void> {
  return SecureStore.setItemAsync(resolveKeys(service).refresh, token, SECURE_OPTIONS);
}

/** Clear both tokens for a single service (e.g. when its refresh fails). */
export async function clearServiceTokens(service: string = "MAIN"): Promise<void> {
  bumpSessionEpoch(service);
  const { access, refresh } = resolveKeys(service);
  await Promise.all([SecureStore.deleteItemAsync(access), SecureStore.deleteItemAsync(refresh)]);
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export async function clearAuthTokens(): Promise<void> {
  const deletions: Promise<void>[] = [];
  serviceTokenKeys.forEach(({ access, refresh }, service) => {
    bumpSessionEpoch(service);
    deletions.push(SecureStore.deleteItemAsync(access), SecureStore.deleteItemAsync(refresh));
  });
  await Promise.all(deletions);
}

/** Tokens minted by a refresh; the refresh token is present when the backend rotates. */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Persist refreshed tokens only if the service's session was not cleared since
 * `epoch` was read. Returns false (and writes nothing) when the session moved on.
 * If a clear lands while the writes are in flight, the just-written values are
 * rolled back — compare-and-delete, so tokens from a newer login are never touched.
 */
export async function persistRefreshedTokensIfCurrent(
  tokens: RefreshedTokens,
  epoch: number,
  service: string = "MAIN",
): Promise<boolean> {
  if (getSessionEpoch(service) !== epoch) return false;
  const { access, refresh } = resolveKeys(service);
  const writes = [SecureStore.setItemAsync(access, tokens.accessToken, SECURE_OPTIONS)];
  if (tokens.refreshToken) {
    writes.push(SecureStore.setItemAsync(refresh, tokens.refreshToken, SECURE_OPTIONS));
  }
  await Promise.all(writes);
  if (getSessionEpoch(service) === epoch) return true;

  const rollback = async (key: string, written?: string) => {
    if (written && (await SecureStore.getItemAsync(key)) === written) {
      await SecureStore.deleteItemAsync(key);
    }
  };
  await Promise.all([rollback(access, tokens.accessToken), rollback(refresh, tokens.refreshToken)]);
  return false;
}
