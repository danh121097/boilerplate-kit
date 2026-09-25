import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth/auth";
import {
  clearServiceTokens,
  endSession,
  getAccessToken,
  getSessionEpoch,
  onSessionEnded,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * How a session ends: a server-rejected session is revoked and ends as
 * "expired" (the login redirect keeps a return path); only a voluntary logout
 * ends as "logout". A tab receiving another tab's logout writes nothing.
 * The store's auto-imported `defineStore` / `ref` / `computed` are provided as
 * globals before it is loaded.
 */
let useAuthStore: typeof import("@/stores/auth").useAuthStore;
let setupSessionExpiry: typeof import("@/plugins/session-expiry").setupSessionExpiry;

type TestRouter = Parameters<typeof setupSessionExpiry>[0];

function makeRouter(route: { name: string; fullPath: string; requiresAuth?: boolean }) {
  const replace = vi.fn().mockResolvedValue(undefined);
  const router = {
    currentRoute: {
      value: {
        name: route.name,
        fullPath: route.fullPath,
        meta: { requiresAuth: route.requiresAuth },
      },
    },
    replace,
  } as unknown as TestRouter;
  return { router, replace };
}

const unauthorized = { error_code: 401, message: "expired" };

describe("session end reasons", () => {
  const stops: Array<() => void> = [];

  const watchEnds = () => {
    const ended = vi.fn();
    stops.push(onSessionEnded(ended));
    return ended;
  };

  beforeAll(async () => {
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("computed", vue.computed);
    ({ useAuthStore } = await import("@/stores/auth"));
    ({ setupSessionExpiry } = await import("@/plugins/session-expiry"));
  });

  beforeEach(() => {
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    vi.restoreAllMocks();
  });

  it("a boot 401 with a live session revokes it and ends it as expired with a return path", async () => {
    const activePinia = pinia.createPinia();
    const { router, replace } = makeRouter({
      name: "users",
      fullPath: "/users?page=2",
      requiresAuth: true,
    });
    setupSessionExpiry(router, activePinia);
    vi.spyOn(AuthModel, "getMe").mockRejectedValue(unauthorized);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();
    const store = useAuthStore(activePinia);

    await store.hydrate();

    expect(post).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url: "/auth/logout", data: { refreshToken: "RT" } }),
    );
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    expect(replace).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
    expect(getAccessToken("MAIN")).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it("a boot 401 after the session already ended does not post logout", async () => {
    vi.spyOn(AuthModel, "getMe").mockImplementation(async () => {
      // A refused refresh ended the session while the profile request ran.
      clearServiceTokens("MAIN");
      endSession("expired", "MAIN");
      throw unauthorized;
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = watchEnds();
    const store = useAuthStore();

    await store.hydrate();

    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN"); // the refresh's, only
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(store.hydrateError).toBeNull();
  });

  it("a session read 401 after a successful refresh revokes the session", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue(unauthorized);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();

    await expect(AuthModel.getSession()).resolves.toBeNull();

    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("concurrent revokes post logout once", async () => {
    let finish!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        (() => new Promise((resolve) => (finish = () => resolve({ success: true })))) as never,
      );
    const ended = watchEnds();

    const first = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    const second = AuthModel.revokeSession();
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("revoking a session that already ended resolves false and posts nothing", async () => {
    const post = vi.spyOn(AuthModel.api, "post");
    const sinceEpoch = getSessionEpoch("MAIN");
    endSession("expired", "MAIN"); // e.g. a refused refresh meanwhile

    await expect(AuthModel.revokeSession(sinceEpoch)).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("a logout during an in-flight revoke posts once and ends the session once", async () => {
    let finish!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        (() => new Promise((resolve) => (finish = () => resolve({ success: true })))) as never,
      );
    const ended = watchEnds();

    const revoke = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    const logout = AuthModel.logout();
    finish();

    await expect(revoke).resolves.toBe(true);
    await expect(logout).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("a voluntary logout ends as logout without a return path", async () => {
    const activePinia = pinia.createPinia();
    const { router, replace } = makeRouter({
      name: "users",
      fullPath: "/users?page=2",
      requiresAuth: true,
    });
    setupSessionExpiry(router, activePinia);
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();

    await useAuthStore(activePinia).logout();

    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: "login" });
  });

  it("a remote logout writes nothing to storage and leaves a protected page without a return path", () => {
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const activePinia = pinia.createPinia();
      const { router, replace } = makeRouter({
        name: "users",
        fullPath: "/users",
        requiresAuth: true,
      });
      setupSessionExpiry(router, activePinia);
      const ended = watchEnds();
      const store = useAuthStore(activePinia);

      // Another tab logged out: its writes reach this tab as a storage event.
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      const setItem = vi.spyOn(localStorage, "setItem");
      const removeItem = vi.spyOn(localStorage, "removeItem");
      const clear = vi.spyOn(localStorage, "clear");
      target.dispatchEvent(new Event("storage"));

      expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalledExactlyOnceWith({ name: "login" });
      expect(store.isAuthenticated).toBe(false);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("a remote logout on a public page stays there", () => {
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const activePinia = pinia.createPinia();
      const { router, replace } = makeRouter({ name: "home", fullPath: "/" });
      setupSessionExpiry(router, activePinia);
      useAuthStore(activePinia);

      localStorage.clear();
      target.dispatchEvent(new Event("storage"));

      expect(replace).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});
