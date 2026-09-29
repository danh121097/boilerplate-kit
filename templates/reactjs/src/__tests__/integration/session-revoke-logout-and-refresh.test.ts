import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { installFakeLocks } from "@/__tests__/helpers/fake-web-locks";
import { httpError, makeClient } from "@/__tests__/helpers/http-mocks";
import { watchNavigation } from "@/__tests__/helpers/watch-session-navigation";
import { AuthModel } from "@/services/auth";
import { bumpSessionEpoch, clearServiceTokens, endSession, refreshLockName } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * A revoke of a rejected session meeting a logout or a token refresh: it backs
 * out (posts nothing, ends nothing) when the session ended before or while it
 * waited, and a logout arriving meanwhile still signs out exactly once.
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

describe("revoke vs logout and refresh", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
  });

  it("a revoke waiting for the lock does nothing when a refused refresh ends the session first", async () => {
    installFakeLocks();
    persistAccessToken("AT");
    persistRefreshToken("RT");
    const post = vi.spyOn(AuthModel.api, "post");
    const nav = watchNavigation("/users");
    // A refresh holds the lock (another tab, or this one) and is then refused.
    let refused!: () => void;
    const refresh = navigator.locks.request(
      refreshLockName("MAIN"),
      () => new Promise<void>((resolve) => (refused = resolve)),
    );

    await vi.waitFor(() => expect(refused).toBeTypeOf("function"));

    const revoke = AuthModel.revokeSession();
    clearServiceTokens("MAIN");
    endSession("expired", "MAIN");
    refused();
    await refresh;

    expect(await revoke).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("a logout joining a revoke that backs out still signs out", async () => {
    installFakeLocks();
    persistAccessToken("AT");
    persistRefreshToken("RT");
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const nav = watchNavigation("/users");
    let release!: () => void;
    const held = navigator.locks.request(
      refreshLockName("MAIN"),
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    await vi.waitFor(() => expect(release).toBeTypeOf("function"));

    const revoke = AuthModel.revokeSession();
    bumpSessionEpoch("MAIN"); // the session the revoke was for is gone; tokens remain
    const logout = AuthModel.logout();
    release();
    await held;

    expect(await revoke).toBe(false);
    await logout;
    expect(post).toHaveBeenCalledTimes(1);
    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("without Web Locks, a revoke waiting for this tab's refresh does nothing when it is refused", async () => {
    vi.stubGlobal("navigator", {});
    persistAccessToken("AT");
    persistRefreshToken("RT");
    let refuse!: () => void;
    const refresh = vi.spyOn(axios, "post").mockImplementation(async () => {
      await new Promise<void>((resolve) => (refuse = resolve));
      throw Object.assign(new Error("refused"), { response: { status: 401, data: {} } });
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const nav = watchNavigation("/users");
    const http = makeClient(async (config) => httpError(config, 401), {
      MAIN: { endpoint: "/auth/refresh", skipPaths: ["/auth/logout"] },
    });
    const pending = http.get("/users").catch((e: unknown) => e);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1)); // refresh in flight

    const revoke = AuthModel.revokeSession();
    refuse();
    await pending;

    expect(await revoke).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(nav.reasons).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });
});
