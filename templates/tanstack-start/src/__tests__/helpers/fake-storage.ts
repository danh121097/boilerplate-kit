import { vi } from "vitest";

/**
 * Install an in-memory `localStorage` and a minimal `window` stub so the
 * token-storage helpers work under the node test environment (where `window`
 * is undefined by default, which triggers the SSR guard in auth-token-storage).
 * Call in `beforeEach`; pair with `vi.unstubAllGlobals()`.
 */
export function installLocalStorage(): void {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  // Stub window so `typeof window !== "undefined"` is true (client env).
  vi.stubGlobal("window", { localStorage: fakeStorage });
  vi.stubGlobal("localStorage", fakeStorage);
}

/**
 * Simulate the SSR / server environment by removing window from the global
 * scope. localStorage access via getAuthToken will return null — matching the
 * SSR guard in auth-token-storage.ts.
 */
export function simulateServerEnvironment(): void {
  vi.stubGlobal("window", undefined);
}
