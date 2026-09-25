import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth";
import {
  clearServiceTokens,
  endSession,
  getSessionEpoch,
  loginPathWithReturn,
  onSessionEnded,
  redirectOnSessionExpired,
} from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { syncAuthWithOtherTabs, useAuthStore } from "@/stores/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two ways a session ends from the client: a voluntary logout ("logout",
 * no return path) and a session the server rejected ("expired", the login page
 * returns to the current path). A logout received from another tab only resets
 * this tab.
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

const UNAUTHORIZED = { status: "error", error_code: 401, message: "expired" };

/** Where the root layout sends the user on each kind of session end. */
function watchNavigation(currentPath: string) {
  const expiredTo = vi.fn();
  const reasons = vi.fn();
  const offRedirect = redirectOnSessionExpired(() => expiredTo(loginPathWithReturn(currentPath)));
  const offEnded = onSessionEnded(reasons);
  return {
    expiredTo,
    reasons,
    stop: () => {
      offRedirect();
      offEnded();
    },
  };
}

describe("session revoke and logout", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a boot 401 with a live session revokes it and ends it as expired with a return path", async () => {
    persistAccessToken("AT");
    persistRefreshToken("RT");
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const nav = watchNavigation("/users?page=2");

    await useAuthStore.getState().hydrate();

    expect(post).toHaveBeenCalledWith({
      url: "/auth/logout",
      data: { refreshToken: "RT" },
      customHeaders: { authorization: "Bearer AT" },
    });
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    expect(nav.expiredTo).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      hydrated: true,
    });
    nav.stop();
  });

  it("a revoke with the epoch moved since the request started does not post logout", async () => {
    persistAccessToken("AT");
    const post = vi.spyOn(AuthModel.api, "post");

    expect(await AuthModel.revokeSession(getSessionEpoch("MAIN") - 1)).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("AT");
  });

  it("a boot 401 after the session already ended does not post logout", async () => {
    persistAccessToken("AT");
    persistRefreshToken("RT");
    // What the interceptor does when the refresh is refused, then the 401 it rejects with.
    vi.spyOn(AuthModel.api, "get").mockImplementation(async () => {
      clearServiceTokens("MAIN");
      endSession("expired", "MAIN");
      throw UNAUTHORIZED;
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const nav = watchNavigation("/users");

    await useAuthStore.getState().hydrate();

    expect(post).not.toHaveBeenCalled();
    expect(nav.reasons).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    nav.stop();
  });

  it("a revoke while a logout is running does not post logout", async () => {
    persistAccessToken("AT");
    let answer!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(() => new Promise((resolve) => (answer = () => resolve({} as never))));

    const logout = AuthModel.logout();
    expect(await AuthModel.revokeSession()).toBe(false);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    answer();
    await logout;

    expect(post).toHaveBeenCalledTimes(1);
  });

  it("concurrent revokes post logout once", async () => {
    persistAccessToken("AT");
    persistRefreshToken("RT");
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const nav = watchNavigation("/users");

    const results = await Promise.all([
      AuthModel.revokeSession(),
      AuthModel.revokeSession(),
      AuthModel.getSession().catch(() => null),
    ]);

    expect(results).toEqual([true, true, null]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    nav.stop();
  });

  it("a logout during an in-flight revoke posts once and ends the session once", async () => {
    persistAccessToken("AT");
    let answer!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(() => new Promise((resolve) => (answer = () => resolve({} as never))));
    const nav = watchNavigation("/users");

    const revoke = AuthModel.revokeSession();
    const logout = AuthModel.logout();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    answer();
    await Promise.all([revoke, logout]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    expect(getAccessToken()).toBeNull();
    nav.stop();
  });

  it("a revoke never rejects when the logout request fails", async () => {
    persistAccessToken("AT");
    vi.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));

    await expect(AuthModel.revokeSession()).resolves.toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  it("a voluntary logout ends as logout without a return path", async () => {
    persistAccessToken("AT");
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const nav = watchNavigation("/users");

    await useAuthStore.getState().logout();

    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(nav.expiredTo).not.toHaveBeenCalled();
    nav.stop();
  });

  it("a remote logout resets this tab without writing storage or posting", () => {
    let onStorage!: (event: { key: string | null }) => void;
    vi.stubGlobal("window", {
      addEventListener: (_type: string, fn: typeof onStorage) => (onStorage = fn),
      removeEventListener: vi.fn(),
    });
    persistAccessToken("AT");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    const post = vi.spyOn(AuthModel.api, "post");
    const nav = watchNavigation("/users");
    const stop = syncAuthWithOtherTabs(vi.fn());
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN); // the other tab's logout
    const setItem = vi.spyOn(localStorage, "setItem");
    const removeItem = vi.spyOn(localStorage, "removeItem");

    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(nav.expiredTo).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    stop();
    nav.stop();
  });
});
