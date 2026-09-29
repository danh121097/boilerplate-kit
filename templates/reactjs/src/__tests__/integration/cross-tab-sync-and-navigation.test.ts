import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { installFakeLocks } from "@/__tests__/helpers/fake-web-locks";
import { STORAGE_KEYS } from "@/enums";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { endSession, getSessionEpoch, onSessionEnded, refreshLockName } from "@/services/core";
import { persistAccessToken } from "@/services/core/auth-token-storage";
import { queryKeys } from "@/services/query-keys";
import { setupSessionExpiry } from "@/services/session-expiry";
import { syncAuthWithOtherTabs, useAuthStore } from "@/stores/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Logins/logouts made in another tab, and where the root layout sends the user
 * when the session ends (remote logout, expiry, this tab's own logout).
 */

// The auth store reads localStorage at import time.
vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

/** The router surface `setupSessionExpiry` reads, on the page at `href`. */
function fakeRouter(href: string, requiresAuth: boolean) {
  return {
    state: {
      location: { href, pathname: href.split("?")[0] },
      matches: [{ staticData: {} }, { staticData: { requiresAuth } }],
    },
    navigate: vi.fn(async (_options: { to?: string; href?: string }) => {}),
  };
}

describe("cross-tab auth sync", () => {
  let onStorage: (event: { key: string | null }) => void;

  beforeEach(() => {
    installLocalStorage();
    vi.stubGlobal("window", {
      addEventListener: (_type: string, fn: typeof onStorage) => {
        onStorage = fn;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a logout in another tab signs this tab out and ends its session as logout", () => {
    persistAccessToken("AT", "MAIN");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    const ended = vi.fn();
    const stopEnds = onSessionEnded(ended);
    const onChange = vi.fn();
    const stop = syncAuthWithOtherTabs(onChange);

    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN); // the other tab's logout
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null });
    // The session-end listener navigates; the root layout's `onChange` skips
    // the guard re-run once signed out.
    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    stopEnds();
  });

  it("a login in another tab drops the cached signed-out user and marks every query stale", () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u1" } as never);
    queryClient.setQueryData([queryKeys.auth.me], null);
    queryClient.setQueryData(["users.list"], { data: [] });
    const stop = syncAuthWithOtherTabs(vi.fn());

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT"); // the other tab's login
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(queryClient.getQueryData([queryKeys.auth.me])).toBeUndefined();
    expect(queryClient.getQueryState(["users.list"])?.isInvalidated).toBe(true);
    stop();
  });

  it("a login in another tab loads the user; a token rotation is ignored", () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    const getMe = vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u1" } as never);
    const onChange = vi.fn();
    const stop = syncAuthWithOtherTabs(onChange);

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT"); // the other tab's login
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT-rotated"); // another tab refreshed
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });
    onStorage({ key: STORAGE_KEYS.LANGUAGE });
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("after this tab logs out, a login in another tab signs this tab in again", async () => {
    vi.stubGlobal("navigator", {});
    persistAccessToken("AT", "MAIN");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u2" } as never);
    const onChange = vi.fn();
    const stop = syncAuthWithOtherTabs(onChange);

    await AuthModel.logout(); // this tab's own logout: no storage event here
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT2"); // the other tab's login
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("a remote logout resets this tab without writing storage or posting", () => {
    persistAccessToken("AT");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    const stop = syncAuthWithOtherTabs(vi.fn());
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN); // the other tab's logout
    const setItem = vi.spyOn(localStorage, "setItem");
    const removeItem = vi.spyOn(localStorage, "removeItem");

    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    stop();
    off();
  });
});

describe("navigation on session end", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a remote logout on a protected page goes to /login without a return path", () => {
    const router = fakeRouter("/users?page=2", true);
    const stop = setupSessionExpiry(router as never);

    endSession("logout", "MAIN"); // what cross-tab sync runs for another tab's logout

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/login" });
    stop();
  });

  it("a remote logout on a public page stays there", () => {
    const router = fakeRouter("/counter", false);
    const stop = setupSessionExpiry(router as never);

    endSession("logout", "MAIN");

    expect(router.navigate).not.toHaveBeenCalled();
    stop();
  });

  it("an expired session goes to /login with a return path", () => {
    const router = fakeRouter("/users?page=2", true);
    const stop = setupSessionExpiry(router as never);

    endSession("expired", "MAIN");

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith({
      href: "/login?redirect=%2Fusers%3Fpage%3D2",
    });
    stop();
  });

  it("a local logout on a protected page navigates once", async () => {
    persistAccessToken("AT");
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const router = fakeRouter("/users", true);
    const stop = setupSessionExpiry(router as never);

    // What the root layout's logout button does.
    await useAuthStore.getState().logout();
    await router.navigate({ to: "/login" });

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/login" });
    stop();
  });

  it("a remote logout while a revoke waits for the lock leaves a protected page", async () => {
    let onStorage!: (event: { key: string | null }) => void;
    vi.stubGlobal("window", {
      addEventListener: (_type: string, fn: typeof onStorage) => (onStorage = fn),
      removeEventListener: vi.fn(),
    });
    const request = installFakeLocks();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    void request(refreshLockName("MAIN"), () => held);
    persistAccessToken("AT");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const router = fakeRouter("/users", true);
    const stop = setupSessionExpiry(router as never);
    const stopSync = syncAuthWithOtherTabs(vi.fn());

    // The session was rejected: the revoke queues behind the held lock.
    const revoke = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN); // the other tab's logout
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });
    release();

    await expect(revoke).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/login" });
    stopSync();
    stop();
  });
});
