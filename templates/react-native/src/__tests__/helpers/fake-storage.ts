/**
 * In-memory stand-ins for the two native modules behind `app-storage`, so token
 * and preference storage works under jest without native code:
 *
 * - `expo-secure-store` — only the encryption-key slot lives here (the sync and
 *   async surface plus the accessibility constants the storage layer references).
 * - `react-native-mmkv` — `createMMKV` / `existsMMKV` / `deleteMMKV` over named
 *   "files", so an instance sees what an earlier one with the same id stored.
 *
 * Both are registered for every suite in `setup-storage.ts`; call
 * `resetStorage()` in `beforeEach` to empty them. A suite that simulates an app
 * relaunch with `jest.resetModules()` keeps its own `StorageState` in the test
 * file (a helper module is re-evaluated by the reset) and passes it to
 * `fakeSecureStore(state)` / `fakeMMKV(state)` in its own `jest.mock` calls.
 */
type MmkvValue = string | number | boolean | ArrayBuffer;

export interface StorageState {
  /** Secure-store slots, by key. */
  secure: Map<string, string>;
  /** MMKV file contents, by instance id. */
  files: Map<string, Map<string, MmkvValue>>;
  /** The encryption key each MMKV instance id was last opened with. */
  fileKeys: Map<string, string | undefined>;
}

export function createStorageState(): StorageState {
  return { secure: new Map(), files: new Map(), fileKeys: new Map() };
}

const defaultState = createStorageState();

/** Empty the default fakes. Files are cleared in place so an instance that is
 * already open (the app memoizes it) sees the reset too. */
export function resetStorage(): void {
  defaultState.secure.clear();
  defaultState.files.forEach((data) => data.clear());
}

export function fakeSecureStore(state: StorageState = defaultState) {
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "whenUnlockedThisDeviceOnly",
    AFTER_FIRST_UNLOCK: "afterFirstUnlock",
    getItem: (key: string): string | null => state.secure.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      state.secure.set(key, String(value));
    },
    getItemAsync: async (key: string): Promise<string | null> => state.secure.get(key) ?? null,
    setItemAsync: async (key: string, value: string): Promise<void> => {
      state.secure.set(key, String(value));
    },
    deleteItemAsync: async (key: string): Promise<void> => {
      state.secure.delete(key);
    },
  };
}

export function fakeMMKV(state: StorageState = defaultState) {
  return {
    createMMKV: ({ id, encryptionKey }: { id: string; encryptionKey?: string }) => {
      if (state.files.has(id) && state.fileKeys.get(id) !== encryptionKey) {
        throw new Error(`MMKV: "${id}" was encrypted with another key`);
      }
      const data = state.files.get(id) ?? new Map<string, MmkvValue>();
      state.files.set(id, data);
      state.fileKeys.set(id, encryptionKey);
      return {
        id,
        getString: (key: string): string | undefined => {
          const value = data.get(key);
          return typeof value === "string" ? value : undefined;
        },
        set: (key: string, value: MmkvValue): void => {
          data.set(key, value);
        },
        remove: (key: string): boolean => data.delete(key),
        contains: (key: string): boolean => data.has(key),
        getAllKeys: (): string[] => [...data.keys()],
        clearAll: (): void => data.clear(),
      };
    },
    existsMMKV: (id: string): boolean => state.files.has(id),
    deleteMMKV: (id: string): boolean => state.files.delete(id),
  };
}
