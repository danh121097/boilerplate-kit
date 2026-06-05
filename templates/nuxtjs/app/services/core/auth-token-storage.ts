import { useStorageKeys } from "@/enums/storage-keys";

/**
 * Browser localStorage token registry. All reads/writes are SSR-guarded —
 * during server rendering they no-op (`getAuthToken` returns `null`,
 * mutations are silently skipped).
 *
 * Per-service design: each API service maps to its own storage slot via a lazy
 * resolver (the slot name depends on the runtime app prefix, only knowable
 * inside a Nuxt request scope). Most apps only need the default MAIN context.
 * To talk to a second authenticated backend (admin panel, partner API, ...),
 * register its slot once at startup alongside its base URL:
 *
 *   Api.setBaseURL(adminURL, "ADMIN");
 *   registerServiceToken("ADMIN", () => `${useRuntimeConfig().public.appName}_ADMIN_TOKEN`);
 *
 * Apps with stricter auth needs should swap this for `useCookie()` (Nuxt
 * native, server + client safe, HttpOnly capable).
 */

type TokenKeyResolver = () => string;

const serviceTokenKeys = new Map<string, TokenKeyResolver>([
  ["MAIN", () => useStorageKeys("AUTH_TOKEN")],
]);

/** Register (or override) the storage slot a service keeps its token in. */
export function registerServiceToken(service: string, resolver: TokenKeyResolver): void {
  serviceTokenKeys.set(service, resolver);
}

/** Resolve a service to its storage slot, falling back to the MAIN slot. */
function resolveTokenKey(service: string): string {
  const resolver = serviceTokenKeys.get(service) ?? (() => useStorageKeys("AUTH_TOKEN"));
  return resolver();
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getAuthToken(service: string = "MAIN"): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(resolveTokenKey(service));
}

export function persistAuthToken(token: string, service: string = "MAIN"): void {
  if (!isClient()) return;
  localStorage.setItem(resolveTokenKey(service), token);
}

/** Clear a single service's token (e.g. when only that service's refresh fails). */
export function clearAuthToken(service: string = "MAIN"): void {
  if (!isClient()) return;
  localStorage.removeItem(resolveTokenKey(service));
}

/** Clear every registered service's token (e.g. on logout). */
export function clearAuthTokens(): void {
  if (!isClient()) return;
  serviceTokenKeys.forEach((resolver) => localStorage.removeItem(resolver()));
}
