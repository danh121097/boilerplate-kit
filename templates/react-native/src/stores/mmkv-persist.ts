import { APP_PREFIX } from "@/enums";
import { getAppStorage } from "@/services/core/app-storage";
import { createJSONStorage, type PersistOptions } from "zustand/middleware";

/**
 * Persist options that keep a Zustand store in the app's encrypted MMKV instance.
 * Use it as the second argument of `persist`:
 *
 *   export const useThemeStore = create<ThemeState>()(
 *     persist(
 *       (set) => ({ mode: "light", setMode: (mode) => set({ mode }) }),
 *       mmkvPersist("theme", { partialize: ({ mode }) => ({ mode }) }),
 *     ),
 *   );
 *
 * The state is saved as JSON under `<app prefix>_STORE_<name>`. MMKV is synchronous,
 * so the store hydrates while it is created: the first render already sees the saved
 * state (`persist.hasHydrated()` is true at once). If the storage cannot be opened
 * (e.g. a locked Keychain) the store keeps its initial state and writes are skipped until a
 * read succeeds (`persist.rehydrate()` retries), so the defaults never overwrite saved state. A persisted store is not cleared on logout: keep tokens and other user
 * data out of it.
 */
export function mmkvPersist<S, P = S>(
  name: string,
  options: Omit<PersistOptions<S, P>, "name" | "storage"> = {},
): PersistOptions<S, P> {
  // Set once a read succeeds: after a failed read the store holds its defaults, and
  // writing them would erase the saved state that could not be loaded.
  let loaded = false;
  return {
    ...options,
    name: `${APP_PREFIX}_STORE_${name}`,
    storage: createJSONStorage<P>(() => ({
      getItem: (key) => {
        const value = getAppStorage().getString(key) ?? null;
        loaded = true;
        return value;
      },
      setItem: (key, value) => {
        if (loaded) getAppStorage().set(key, value);
      },
      removeItem: (key) => {
        if (loaded) getAppStorage().remove(key);
      },
    })),
  };
}
