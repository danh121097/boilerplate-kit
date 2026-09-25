import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { APP_PREFIX } from "@/enums";
import { SessionEndedError } from "@/services/core/api-errors";
import {
  getAccessToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { bumpSessionEpoch } from "@/services/core/session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tick = () => new Promise((r) => setTimeout(r, 5));
const httpFailure = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });

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
    persistRefreshToken("RT", "MAIN");
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

  it("rejects session_ended without a network call when no token is stored (e.g. another tab logged out)", async () => {
    const refresh = vi.fn(async () => ({ accessToken: "T1" }));
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh,
      onRefreshFailed,
      isSessionAlive: () => false,
    });

    await expect(mgr.getFreshToken()).rejects.toBeInstanceOf(SessionEndedError);
    expect(refresh).not.toHaveBeenCalled();
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });

  for (const status of [401, 403]) {
    it(`clears the service token and fires onRefreshFailed when refresh is refused with ${status}`, async () => {
      persistAccessToken("OLD", "MAIN");
      const onRefreshFailed = vi.fn();
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          throw httpFailure(status);
        },
        onRefreshFailed,
      });

      await expect(mgr.getFreshToken()).rejects.toMatchObject({ response: { status } });
      expect(onRefreshFailed).toHaveBeenCalledTimes(1);
      expect(getAccessToken("MAIN")).toBeNull(); // cleared
    });
  }

  for (const [label, failure] of [
    ["a 400", httpFailure(400)],
    ["a malformed body", new Error("refresh_response_missing_access_token")],
  ] as const) {
    it(`keeps the tokens (no failure hook) when the refresh fails with ${label}`, async () => {
      persistAccessToken("OLD", "MAIN");
      const onRefreshFailed = vi.fn();
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          throw failure;
        },
        onRefreshFailed,
      });

      await expect(mgr.getFreshToken("OLD")).rejects.toBe(failure);
      expect(onRefreshFailed).not.toHaveBeenCalled();
      expect(getAccessToken("MAIN")).toBe("OLD");
    });
  }

  it("a refresh that resolves after the session ended persists nothing and rejects session_ended", async () => {
    persistAccessToken("OLD", "MAIN");
    const onRefreshed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        bumpSessionEpoch("MAIN");
        return { accessToken: "LATE" };
      },
      onRefreshed,
      onRefreshFailed: () => {},
    });

    await expect(mgr.getFreshToken("OLD")).rejects.toBeInstanceOf(SessionEndedError);
    expect(getAccessToken("MAIN")).toBe("OLD");
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("fires onRefreshed after persisting a rotated pair", async () => {
    persistAccessToken("OLD", "MAIN");
    const onRefreshed = vi.fn(() => expect(getAccessToken("MAIN")).toBe("NEW"));
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: "NEW", refreshToken: "NEW_R" }),
      onRefreshed,
      onRefreshFailed: () => {},
    });

    expect(await mgr.getFreshToken("OLD")).toBe("NEW");
    expect(onRefreshed).toHaveBeenCalledTimes(1);
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
      refresh: async () => ({ accessToken: "NEW" }),
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
    const refresh = vi.fn(async () => ({ accessToken: "NEW" }));
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken("OLD")).toBe("FROM_OTHER_TAB");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("falls back to an unlocked refresh when navigator.locks is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    persistAccessToken("OLD", "MAIN");
    const refresh = vi.fn(async () => ({ accessToken: "NEW" }));
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken("OLD")).toBe("NEW");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
