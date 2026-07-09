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
 * register its slots once at startup alongside its base URL:
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
 * SecureStore keys must match `[A-Za-z0-9._-]`; `STORAGE_KEYS` values are
 * underscore-only, so they are already legal.
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

export function clearAccessToken(service: string = "MAIN"): Promise<void> {
  return SecureStore.deleteItemAsync(resolveKeys(service).access);
}

export function getRefreshToken(service: string = "MAIN"): Promise<string | null> {
  return SecureStore.getItemAsync(resolveKeys(service).refresh);
}

export function persistRefreshToken(token: string, service: string = "MAIN"): Promise<void> {
  return SecureStore.setItemAsync(resolveKeys(service).refresh, token, SECURE_OPTIONS);
}

export function clearRefreshToken(service: string = "MAIN"): Promise<void> {
  return SecureStore.deleteItemAsync(resolveKeys(service).refresh);
}

/** Clear both tokens for a single service (e.g. when its refresh fails). */
export async function clearServiceTokens(service: string = "MAIN"): Promise<void> {
  const { access, refresh } = resolveKeys(service);
  await Promise.all([SecureStore.deleteItemAsync(access), SecureStore.deleteItemAsync(refresh)]);
}

/** Clear every registered service's access + refresh tokens (e.g. on logout). */
export async function clearAuthTokens(): Promise<void> {
  const deletions: Promise<void>[] = [];
  serviceTokenKeys.forEach(({ access, refresh }) => {
    deletions.push(SecureStore.deleteItemAsync(access), SecureStore.deleteItemAsync(refresh));
  });
  await Promise.all(deletions);
}
