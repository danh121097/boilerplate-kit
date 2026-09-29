import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { watchNavigation } from "@/__tests__/helpers/watch-session-navigation";
import { AuthModel } from "@/services/auth";
import { clearServiceTokens, endSession, getSessionEpoch } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { useAuthStore } from "@/stores/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two ways a session ends from the client: a voluntary logout ("logout",
 * no return path) and a session the server rejected ("expired", the login page
 * returns to the current path). How a revoke meets a logout or a refresh lives
 * in session-revoke-logout-and-refresh.test.ts.
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
  });
});
