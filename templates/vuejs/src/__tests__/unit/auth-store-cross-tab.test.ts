import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { loadAuthStore } from "@/__tests__/helpers/session-harness";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth/auth";
import { onSessionEnded, persistAccessToken, persistRefreshToken } from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";

/**
 * The auth store follows logins / logouts made in other tabs: they reach this
 * tab as `storage` events on the shared token slots (`window` is stubbed as an
 * `EventTarget`). This tab's own logins / logouts move the baseline too, and a
 * plain token rotation elsewhere is ignored.
 */
let useAuthStore: Awaited<ReturnType<typeof loadAuthStore>>["useAuthStore"];
let queryClient: typeof import("@/plugins/vue-query").queryClient;

describe("auth store across tabs", () => {
  beforeAll(async () => {
    ({ useAuthStore } = await loadAuthStore());
    ({ queryClient } = await import("@/plugins/vue-query"));
  });

  beforeEach(() => {
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => vi.restoreAllMocks());

  it("another tab's logout clears this tab's user and query cache", () => {
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const store = useAuthStore();
      store.setUser({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);
      queryClient.setQueryData(["users.list"], ["someone"]);

      // The other tab removed the tokens — this tab's helpers were not called.
      localStorage.clear();
      target.dispatchEvent(new Event("storage"));

      expect(store.isAuthenticated).toBe(false);
      expect(store.user).toBeNull();
      expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("another tab's login marks every query stale and re-reads the profile", async () => {
    localStorage.clear(); // this tab is signed out
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const store = useAuthStore();
      await store.hydrate();
      expect(store.isAuthenticated).toBe(false);
      queryClient.setQueryData(["users.list"], ["stale"]);
      const me = { _id: "u2", email: "b@b.com", name: "B", role: "user" };
      const getMe = vi.spyOn(AuthModel, "getMe").mockResolvedValue(me as never);

      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT3");
      target.dispatchEvent(new Event("storage"));

      expect(store.isAuthenticated).toBe(true);
      const list = queryClient.getQueryCache().find({ queryKey: ["users.list"] });
      expect(list?.state.isInvalidated).toBe(true);
      await vi.waitFor(() => expect(store.user).toEqual(me));
      expect(getMe).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("remote logout after a same-tab login is applied", () => {
    localStorage.clear(); // signed out when the store starts
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const store = useAuthStore();
      const ended = vi.fn();
      const stop = onSessionEnded(ended);

      // This tab signs in.
      persistAccessToken("AT2", "MAIN");
      persistRefreshToken("RT2", "MAIN");
      expect(store.isAuthenticated).toBe(true);

      // Another tab signs out.
      localStorage.clear();
      target.dispatchEvent(new Event("storage"));
      stop();

      expect(ended).toHaveBeenCalledWith("logout", "MAIN");
      expect(store.isAuthenticated).toBe(false);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("remote login after a same-tab logout is applied", async () => {
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const store = useAuthStore();
      // This tab signs out.
      store.clearSession();
      expect(store.isAuthenticated).toBe(false);
      const me = { _id: "u3", email: "c@b.com", name: "C", role: "user" };
      const getMe = vi.spyOn(AuthModel, "getMe").mockResolvedValue(me as never);

      // Another tab signs in.
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT4");
      target.dispatchEvent(new Event("storage"));

      expect(store.isAuthenticated).toBe(true);
      await vi.waitFor(() => expect(store.user).toEqual(me));
      expect(getMe).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("a token rotation in another tab keeps this tab's state", () => {
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const store = useAuthStore();
      store.setUser({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);
      queryClient.setQueryData(["users.list"], ["someone"]);

      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT-rotated");
      target.dispatchEvent(new Event("storage"));

      expect(store.user).not.toBeNull();
      expect(queryClient.getQueryData(["users.list"])).toEqual(["someone"]);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});
