/**
 * In-memory async mock of `expo-secure-store` so the token-storage helpers work
 * under jest without a native module. Mirrors the async SecureStore surface
 * (`getItemAsync` / `setItemAsync` / `deleteItemAsync`) plus the accessibility
 * constants the storage layer references.
 *
 * Usage: `jest.mock("expo-secure-store", () => fakeSecureStore());` at the top of
 * a test file, then `resetSecureStore()` in `beforeEach`.
 */
const store = new Map<string, string>();

export function resetSecureStore(): void {
  store.clear();
}

export function fakeSecureStore() {
  return {
    WHEN_UNLOCKED: "whenUnlocked",
    AFTER_FIRST_UNLOCK: "afterFirstUnlock",
    getItemAsync: async (key: string): Promise<string | null> =>
      store.has(key) ? store.get(key)! : null,
    setItemAsync: async (key: string, value: string): Promise<void> => {
      store.set(key, String(value));
    },
    deleteItemAsync: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
}
