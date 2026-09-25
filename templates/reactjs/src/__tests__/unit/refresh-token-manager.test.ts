import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { installFakeLocks } from "@/__tests__/helpers/fake-web-locks";
import { APP_PREFIX } from "@/enums";
import { SessionEndedError } from "@/services/core/api-errors";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { bumpSessionEpoch } from "@/services/core/session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("RefreshTokenManager", () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => vi.unstubAllGlobals());

  it("dedupes concurrent calls into a single refresh and persists the token", async () => {
    let runs = 0;

    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        runs += 1;
        await tick();
        return { accessToken: `T${runs}` };
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
    let runs = 0;

    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: `T${++runs}` }),
      onRefreshFailed: () => {},
    });

    expect(await mgr.getFreshToken()).toBe("T1");
    expect(await mgr.getFreshToken()).toBe("T2");
    expect(runs).toBe(2);
  });

  it("serializes refreshes across tabs and reuses a token another tab already rotated", async () => {
    const request = installFakeLocks();
    persistAccessToken("OLD", "MAIN");
    let runs = 0;
    const tab = () =>
      new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          runs += 1;
          await tick();
          return { accessToken: "NEW" };
        },
        onRefreshFailed: () => {},
      });

    // Two tabs (sharing localStorage) hit a 401 with the same stale token.
    const [a, b] = await Promise.all([tab().getFreshToken("OLD"), tab().getFreshToken("OLD")]);

    expect(request).toHaveBeenCalledTimes(2); // both went through the lock
    expect(runs).toBe(1); // only one network refresh — no refresh-token replay
    expect([a, b]).toEqual(["NEW", "NEW"]);
  });

  it("falls back to a plain refresh when the Web Locks API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: "T1" }),
      onRefreshFailed: () => {},
    });

    expect(await mgr.getFreshToken()).toBe("T1");
  });

  it("clears the service token and fires onRefreshFailed when the refresh is refused", async () => {
    persistAccessToken("OLD", "MAIN");
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw Object.assign(new Error("refresh failed"), { response: { status: 401 } });
      },
      onRefreshFailed,
    });

    await expect(mgr.getFreshToken()).rejects.toThrow("refresh failed");
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    expect(getAccessToken("MAIN")).toBeNull(); // cleared
  });

  it("keeps the token and does not fire onRefreshFailed on a transient failure", async () => {
    persistAccessToken("OLD", "MAIN");
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
      },
      onRefreshFailed,
    });

    await expect(mgr.getFreshToken()).rejects.toThrow("Network Error");
    expect(onRefreshFailed).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("OLD");
  });

  it("stores the rotated pair and serializes under an app-prefixed lock", async () => {
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: "AT2", refreshToken: "RT2" }),
      onRefreshFailed: () => {},
    });
    const request = installFakeLocks();

    expect(await mgr.getFreshToken()).toBe("AT2");
    expect(getRefreshToken("MAIN")).toBe("RT2");
    expect(request.mock.calls[0]![0]).toBe(`${APP_PREFIX}:auth-refresh:MAIN`);
  });

  it("stores nothing when the session ends while the refresh is in flight", async () => {
    persistAccessToken("OLD", "MAIN");
    persistRefreshToken("RT1", "MAIN");
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        await tick();
        return { accessToken: "AT2", refreshToken: "RT2" };
      },
      onRefreshFailed,
    });

    const pending = mgr.getFreshToken();
    bumpSessionEpoch(); // logout / session end
    await expect(pending).rejects.toBeInstanceOf(SessionEndedError);
    expect(getAccessToken("MAIN")).toBe("OLD");
    expect(getRefreshToken("MAIN")).toBe("RT1");
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });

  it("does not refresh once the lock is held if another tab already logged out", async () => {
    const refresh = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh,
      onRefreshFailed: () => {},
      isSessionAlive: () => false,
    });

    await expect(mgr.getFreshToken()).rejects.toBeInstanceOf(SessionEndedError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh when the session check resolves false once the lock is held", async () => {
    const refresh = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh,
      onRefreshFailed: () => {},
      isSessionAlive: async () => false,
    });

    await expect(mgr.getFreshToken()).rejects.toBeInstanceOf(SessionEndedError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("calls onRefreshed after storing the rotated pair", async () => {
    const onRefreshed = vi.fn(() => expect(getAccessToken("MAIN")).toBe("AT2"));
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: "AT2" }),
      onRefreshed,
      onRefreshFailed: () => {},
    });

    await mgr.getFreshToken();
    expect(onRefreshed).toHaveBeenCalledTimes(1);
  });

  it("another service's session end does not abort this service's refresh", async () => {
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        await tick();
        return { accessToken: "AT2" };
      },
      onRefreshFailed: () => {},
    });

    const pending = mgr.getFreshToken();
    bumpSessionEpoch("ADMIN");
    await expect(pending).resolves.toBe("AT2");
    expect(getAccessToken("MAIN")).toBe("AT2");
  });

  it("refreshes when the failed request carried no Bearer, even with a token stored", async () => {
    persistAccessToken("AT1", "MAIN");
    const refresh = vi.fn(async () => ({ accessToken: "AT2" }));
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken()).toBe("AT2");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reuses the stored token when it was rotated after the failed request was sent", async () => {
    persistAccessToken("NEW", "MAIN");
    const refresh = vi.fn(async () => ({ accessToken: "NEWER" }));
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken("OLD")).toBe("NEW");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the stored token is the one the failed request carried", async () => {
    persistAccessToken("OLD", "MAIN");
    const refresh = vi.fn(async () => ({ accessToken: "NEW" }));
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken("OLD")).toBe("NEW");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
