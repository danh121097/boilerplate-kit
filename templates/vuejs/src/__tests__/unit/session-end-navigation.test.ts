import { deferred, fakeLocks } from "@/__tests__/helpers/fake-locks";
import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { loadAuthStore, makeRouter } from "@/__tests__/helpers/session-harness";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth/auth";
import {
  getSessionEpoch,
  onSessionEnded,
  persistAccessToken,
  persistRefreshToken,
  refreshLockName,
} from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";

/**
 * Where a session end sends the user: only a voluntary logout ends as
 * "logout", and it navigates on its own (to plain /login). A tab receiving
 * another tab's logout writes nothing and leaves a protected page for
 * /login with a return path; a public page stays.
 */
type Store = Awaited<ReturnType<typeof loadAuthStore>>;
let useAuthStore: Store["useAuthStore"];
let setupSessionExpiry: Store["setupSessionExpiry"];

describe("session end navigation", () => {
  const stops: Array<() => void> = [];

  const watchEnds = () => {
    const ended = vi.fn();
    stops.push(onSessionEnded(ended));
    return ended;
  };

  beforeAll(async () => {
    ({ useAuthStore, setupSessionExpiry } = await loadAuthStore());
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
    vi.unstubAllGlobals();
  });

  it("a voluntary logout ends as logout without a return path", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();

    await useAuthStore().logout();

    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
  });

  it("a local logout on a protected page navigates once", async () => {
    const activePinia = pinia.createPinia();
    const { router, replace, push } = makeRouter({
      name: "users",
      fullPath: "/users?page=2",
      requiresAuth: true,
    });
    setupSessionExpiry(router, activePinia);
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    // What the logout button (App.vue) does: log out, then go to /login.
    await useAuthStore(activePinia).logout();
    await router.push({ name: "login" });

    expect(replace).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledExactlyOnceWith({ name: "login" });
  });

  it("a remote logout writes nothing to storage and leaves a protected page with a return path", () => {
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
      expect(replace).toHaveBeenCalledExactlyOnceWith("/login?redirect=%2Fusers");
      expect(store.isAuthenticated).toBe(false);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("a remote logout while a revoke waits for the lock leaves a protected page", async () => {
    const target = new EventTarget();
    Object.assign(globalThis, { window: target });
    try {
      const locks = fakeLocks();
      vi.stubGlobal("navigator", { locks });
      const holder = deferred<void>();
      void locks.request(refreshLockName("MAIN"), () => holder.promise);
      const activePinia = pinia.createPinia();
      const { router, replace, push } = makeRouter({
        name: "users",
        fullPath: "/users",
        requiresAuth: true,
      });
      setupSessionExpiry(router, activePinia);
      useAuthStore(activePinia);
      const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
      const ended = watchEnds();

      // The session was rejected: the revoke queues behind the held lock.
      const revoke = AuthModel.revokeSession(getSessionEpoch("MAIN"));
      // Meanwhile another tab logs out; its writes arrive as a storage event.
      localStorage.clear();
      target.dispatchEvent(new Event("storage"));
      holder.resolve();

      await expect(revoke).resolves.toBe(false);
      expect(post).not.toHaveBeenCalled();
      expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
      expect(replace).toHaveBeenCalledExactlyOnceWith("/login?redirect=%2Fusers");
      expect(push).not.toHaveBeenCalled();
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
