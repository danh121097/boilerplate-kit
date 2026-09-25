import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { APP_PREFIX } from "@/enums";
import {
  getAccessToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { RefreshTokenManager, SessionEndedError } from "@/services/core/refresh-token-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("RefreshTokenManager", () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => vi.unstubAllGlobals());

  it("dedupes concurrent calls into a single refresh and persists the token", async () => {
    persistRefreshToken("RT", "MAIN");
    let runs = 0;
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        runs += 1;
        await tick();
        return `T${runs}`;
      },
      onRefreshFailed: () => {},
    });

    const [a, b, c] = await Promise.all([
      mgr.getFreshToken(),
      mgr.getFreshToken(),
      mgr.getFreshToken(),
    ]);

    expect(runs).toBe(1); // single-flight
    expect([a, b, c]).toEqual(["T1", "T1", "T1"]);
    expect(getAccessToken("MAIN")).toBe("T1"); // persisted
  });

  it("refreshes again after the in-flight one settles", async () => {
    persistRefreshToken("RT", "MAIN");
    let runs = 0;
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => `T${++runs}`,
      onRefreshFailed: () => {},
    });

    expect(await mgr.getFreshToken()).toBe("T1");
    expect(await mgr.getFreshToken()).toBe("T2");
    expect(runs).toBe(2);
  });

  it("rejects session_ended without a network call when no token is stored (e.g. another tab logged out)", async () => {
    const refresh = vi.fn(async () => "T1");
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed });

    await expect(mgr.getFreshToken()).rejects.toBeInstanceOf(SessionEndedError);
    expect(refresh).not.toHaveBeenCalled();
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });

  it("clears the service token and fires onRefreshFailed when refresh rejects", async () => {
    persistAccessToken("OLD", "MAIN");
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw new Error("refresh failed");
      },
      onRefreshFailed,
    });

    await expect(mgr.getFreshToken()).rejects.toThrow("refresh failed");
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    expect(getAccessToken("MAIN")).toBeNull(); // cleared
  });

  it("keeps the tokens (no failure hook) when the refresh fails transiently", async () => {
    persistAccessToken("OLD", "MAIN");
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw Object.assign(new Error("Network Error"), { isAxiosError: true });
      },
      onRefreshFailed,
    });

    await expect(mgr.getFreshToken("OLD")).rejects.toThrow("Network Error");
    expect(onRefreshFailed).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("OLD");
  });
});

describe("RefreshTokenManager — cross-tab lock", () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => vi.unstubAllGlobals());

  it("runs the refresh under a per-service Web Lock", async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal("navigator", { locks: { request } });
    persistAccessToken("OLD", "MAIN");
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => "NEW",
      onRefreshFailed: () => {},
    });

    expect(await mgr.getFreshToken("OLD")).toBe("NEW");
    expect(request).toHaveBeenCalledWith(`${APP_PREFIX}:auth-refresh:MAIN`, expect.any(Function));
  });

  it("skips the network refresh when another tab rotated the token while waiting", async () => {
    // Another tab holds the lock, rotates the pair, then releases it to us.
    const request = vi.fn(async (_name: string, task: () => Promise<unknown>) => {
      persistAccessToken("FROM_OTHER_TAB", "MAIN");
      return task();
    });
    vi.stubGlobal("navigator", { locks: { request } });
    persistAccessToken("OLD", "MAIN");
    const refresh = vi.fn(async () => "NEW");
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken("OLD")).toBe("FROM_OTHER_TAB");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("falls back to an unlocked refresh when navigator.locks is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    persistAccessToken("OLD", "MAIN");
    const refresh = vi.fn(async () => "NEW");
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken("OLD")).toBe("NEW");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
