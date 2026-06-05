import { vi } from "vitest";

/**
 * Install an in-memory `localStorage` so the token-storage helpers work under the
 * node test environment. Call in `beforeEach`; pair with `vi.unstubAllGlobals()`.
 */
export function installLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}
