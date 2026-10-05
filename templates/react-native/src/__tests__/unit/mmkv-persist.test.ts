import { resetStorage } from "@/__tests__/helpers/fake-storage";
import { APP_PREFIX } from "@/enums";
import { getAppStorage } from "@/services/core/app-storage";
import { mmkvPersist } from "@/stores/mmkv-persist";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CounterState {
  count: number;
  transient: string;
  inc: () => void;
}

/** A new store over the same storage, as an app relaunch builds one. */
function makeStore() {
  return create<CounterState>()(
    persist(
      (set) => ({
        count: 0,
        transient: "",
        inc: () => set((s) => ({ count: s.count + 1, transient: "not saved" })),
      }),
      mmkvPersist("counter", { partialize: ({ count }) => ({ count }) }),
    ),
  );
}

describe("mmkvPersist", () => {
  beforeEach(() => resetStorage());

  it("saves the partialized state under a prefixed key and hydrates a new store synchronously", () => {
    const first = makeStore();
    first.getState().inc();
    first.getState().inc();

    const raw = getAppStorage().getString(`${APP_PREFIX}_STORE_counter`);
    expect(JSON.parse(raw!)).toEqual({ state: { count: 2 }, version: 0 });

    const second = makeStore(); // no await: the first render already sees the saved state
    expect(second.persist.hasHydrated()).toBe(true);
    expect(second.getState()).toMatchObject({ count: 2, transient: "" });
  });

  it("does not overwrite saved state after a failed read, and recovers on rehydrate", async () => {
    makeStore().getState().inc();
    makeStore().getState().inc(); // saved count: 2
    const read = jest.spyOn(getAppStorage(), "getString").mockImplementationOnce(() => {
      throw new Error("keychain locked");
    });

    const store = makeStore(); // the read fails: defaults, nothing hydrated
    expect(store.getState().count).toBe(0);
    store.getState().inc(); // must not write { count: 1 } over the saved state
    read.mockRestore();
    expect(JSON.parse(getAppStorage().getString(`${APP_PREFIX}_STORE_counter`)!).state).toEqual({
      count: 2,
    });

    await store.persist.rehydrate();
    expect(store.getState().count).toBe(2);
  });
});
