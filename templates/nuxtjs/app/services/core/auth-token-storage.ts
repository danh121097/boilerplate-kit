import { useStorageKeys } from "@/enums/storage-keys";

/**
 * Browser localStorage token registry. All reads/writes are SSR-guarded —
 * during server rendering they no-op (`getAuthToken` returns `null`,
 * mutations are silently skipped).
 *
 * Apps with stricter auth needs should swap this for `useCookie()` (Nuxt
 * native, server + client safe, HttpOnly capable).
 */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function clearAuthTokens(): void {
  if (!isClient()) return;
  const keys = useStorageKeys();
  [keys.AUTH_TOKEN, keys.AUX_TOKEN].forEach((k) => localStorage.removeItem(k));
}

export function persistAuthToken(token: string, key?: string): void {
  if (!isClient()) return;
  const keys = useStorageKeys();
  localStorage.setItem(key ?? keys.AUTH_TOKEN, token);
}

export function getAuthToken(key?: string): string | null {
  if (!isClient()) return null;
  const keys = useStorageKeys();
  return localStorage.getItem(key ?? keys.AUTH_TOKEN);
}

export function tokenKeys() {
  const keys = useStorageKeys();
  return { MAIN: keys.AUTH_TOKEN, AUX: keys.AUX_TOKEN } as const;
}
