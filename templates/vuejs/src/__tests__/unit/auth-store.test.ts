import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth/auth";
import {
  clearServiceTokens,
  endSession,
  getAccessToken,
  onSessionEnded,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * The auth store relies on auto-imported `defineStore` / `ref` / `computed`
 * (unplugin-auto-import is not part of the vitest config), so they are provided
 * as globals before the store module is loaded.
 */
let useAuthStore: typeof import("@/stores/auth").useAuthStore;
let queryClient: typeof import("@/plugins/vue-query").queryClient;
let setupSessionExpiry: typeof import("@/plugins/session-expiry").setupSessionExpiry;

describe("auth store", () => {
  beforeAll(async () => {
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("computed", vue.computed);
    ({ useAuthStore } = await import("@/stores/auth"));
    ({ queryClient } = await import("@/plugins/vue-query"));
    ({ setupSessionExpiry } = await import("@/plugins/session-expiry"));
  });

  beforeEach(() => {
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => vi.restoreAllMocks());

  it("hydrate keeps the tokens on a network error (no logout)", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue({ error_code: 0, message: "Network Error" });
    const logout = vi.spyOn(AuthModel, "logout");
    const store = useAuthStore();

    await store.hydrate();

    expect(getAccessToken("MAIN")).toBe("AT");
    expect(store.isAuthenticated).toBe(true);
    expect(logout).not.toHaveBeenCalled();
  });

  it("hydrate keeps the tokens on a 5xx", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue({ error_code: 503, message: "down" });
    const store = useAuthStore();

    await store.hydrate();

    expect(getAccessToken("MAIN")).toBe("AT");
  });

  it("hydrate surfaces a transient failure as a retryable error, and retry recovers", async () => {
    const store = useAuthStore();

    const me = { _id: "u1", email: "a@b.com", name: "A", role: "user" };
    const getMe = vi
      .spyOn(AuthModel, "getMe")
      .mockRejectedValueOnce({ error_code: 0, message: "Network Error" })
      .mockResolvedValueOnce(me as never);

    await store.hydrate();
    expect(store.hydrateError).toMatchObject({ error_code: 0, retryable: true });
    expect(store.isAuthenticated).toBe(true);

    await store.retryHydrate();
    expect(store.hydrateError).toBeNull();
    expect(store.user).toEqual(me);
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it("isAuthenticated reacts to token writes and clears (localStorage is not reactive)", () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(true);

    store.clearSession();
    expect(store.isAuthenticated).toBe(false);

    persistAccessToken("AT2", "MAIN");
    expect(store.isAuthenticated).toBe(true);
  });

  it("logout sends the refresh token in the body and clears tokens + query cache", async () => {
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    queryClient.setQueryData(["users.list"], ["someone"]);
    const store = useAuthStore();

    await store.logout();

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/auth/logout", data: { refreshToken: "RT" } }),
    );
    expect(getAccessToken("MAIN")).toBeNull();
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(store.isAuthenticated).toBe(false);
  });

  it("voluntary logout never announces session expiry, even when the request fails", async () => {
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 0, message: "Network Error" });
    const ended = vi.fn();
    const unsubscribe = onSessionEnded(ended);
    queryClient.setQueryData(["users.list"], ["someone"]);
    const store = useAuthStore();
    store.setUser({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);

    await store.logout();
    unsubscribe();

    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(store.user).toBeNull();
    expect(getAccessToken("MAIN")).toBeNull();
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
  });

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

  it("session expiry clears the session + cache and routes to /login with a redirect", () => {
    const activePinia = pinia.createPinia();
    pinia.setActivePinia(activePinia);
    const replace = vi.fn().mockResolvedValue(undefined);
    const router = {
      currentRoute: { value: { name: "users", fullPath: "/users?page=2", meta: {} } },
      replace,
    } as unknown as Parameters<typeof setupSessionExpiry>[0];
    setupSessionExpiry(router, activePinia);
    queryClient.setQueryData(["users.list"], ["someone"]);

    // The refresh manager clears the refused service's tokens, then ends the session.
    clearServiceTokens("MAIN");
    endSession("expired", "MAIN");

    expect(useAuthStore(activePinia).isAuthenticated).toBe(false);
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
  });
});
