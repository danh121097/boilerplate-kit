import { vi } from "vitest";

/**
 * Stub the Nuxt globals the service layer touches outside a request scope:
 * an in-memory `localStorage`, a minimal `useRuntimeConfig`, and `window` (the
 * storage helper is client-guarded). Call in `beforeEach`; pair with
 * `vi.unstubAllGlobals()`.
 */
export function installLocalStorage(runtimePublic: Record<string, unknown> = {}): void {
  vi.stubGlobal("useRuntimeConfig", () => ({ public: runtimePublic }));
  vi.stubGlobal("window", globalThis);
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}
