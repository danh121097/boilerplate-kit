import { STORAGE_KEYS } from "@/enums";

const KEYS = [STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.AUX_TOKEN] as const;

export const TOKEN_KEYS = { MAIN: STORAGE_KEYS.AUTH_TOKEN, AUX: STORAGE_KEYS.AUX_TOKEN } as const;

export function clearAuthTokens(): void {
  KEYS.forEach((k) => localStorage.removeItem(k));
}

export function persistAuthToken(token: string, key: string = STORAGE_KEYS.AUTH_TOKEN): void {
  localStorage.setItem(key, token);
}

export function getAuthToken(key: string = STORAGE_KEYS.AUTH_TOKEN): string | null {
  return localStorage.getItem(key);
}
