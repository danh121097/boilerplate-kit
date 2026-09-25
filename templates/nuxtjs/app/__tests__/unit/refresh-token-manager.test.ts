import { SessionEndedError } from "@/services/core/api-errors";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { bumpSessionEpoch } from "@/services/core/session";
import { afterEach, describe, expect, it, vi } from "vitest";

const tick = () => new Promise((r) => setTimeout(r, 5));
const httpFailure = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });

describe("RefreshTokenManager", () => {
  afterEach(() => vi.restoreAllMocks());

  it("dedupes concurrent calls into a single refresh", async () => {
    let runs = 0;
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        runs += 1;
        await tick();
      },
      onRefreshFailed: () => {},
    });

    await Promise.all([mgr.refresh(), mgr.refresh(), mgr.refresh()]);

    expect(runs).toBe(1); // single-flight
  });

  it("refreshes again after the in-flight one settles", async () => {
    let runs = 0;
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        runs += 1;
      },
      onRefreshFailed: () => {},
    });

    await mgr.refresh();
    await mgr.refresh();
    expect(runs).toBe(2);
  });

  for (const status of [401, 403]) {
    it(`fires onRefreshFailed and rethrows when the refresh is refused with ${status}`, async () => {
      const onRefreshFailed = vi.fn();
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          throw httpFailure(status);
        },
        onRefreshFailed,
      });

      await expect(mgr.refresh()).rejects.toMatchObject({ response: { status } });
      expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    });
  }

  for (const [label, failure] of [
    ["a 400", httpFailure(400)],
    ["a plain error", new Error("refresh failed")],
  ] as const) {
    it(`does not fire onRefreshFailed when the refresh fails with ${label}`, async () => {
      const onRefreshFailed = vi.fn();
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          throw failure;
        },
        onRefreshFailed,
      });

      await expect(mgr.refresh()).rejects.toBe(failure);
      expect(onRefreshFailed).not.toHaveBeenCalled();
    });
  }

  it("rejects session_ended without a network call when no session hint is left", async () => {
    const refresh = vi.fn(async () => {});
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh,
      onRefreshFailed,
      isSessionAlive: () => false,
    });

    await expect(mgr.refresh()).rejects.toBeInstanceOf(SessionEndedError);
    expect(refresh).not.toHaveBeenCalled();
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });

  it("a refresh that resolves after the session ended fires no hooks and rejects session_ended", async () => {
    const onRefreshed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => bumpSessionEpoch("MAIN"),
      onRefreshed,
      onRefreshFailed: () => {},
    });

    await expect(mgr.refresh()).rejects.toBeInstanceOf(SessionEndedError);
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("does not fire onRefreshFailed when the refresh fails transiently", async () => {
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw Object.assign(new Error("Network Error"), { isAxiosError: true });
      },
      onRefreshFailed,
    });

    await expect(mgr.refresh()).rejects.toThrow("Network Error");
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });
});

describe("RefreshTokenManager — cross-tab lock", () => {
  afterEach(() => vi.unstubAllGlobals());

  function memoryStorage() {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  }

  it("runs the refresh under a per-service Web Lock", async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal("navigator", { locks: { request } });
    const refresh = vi.fn(async () => {});
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    await mgr.refresh(Date.now());
    expect(request).toHaveBeenCalledWith("PRISM_APP:auth-refresh:MAIN", expect.any(Function));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("skips the refresh when another tab rotated the cookies after the request was sent", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const sentAt = Date.now() - 1000;
    // Another tab holds the lock, refreshes, records the rotation, then releases.
    const request = vi.fn(async (_name: string, task: () => Promise<unknown>) => {
      storage.setItem("PRISM_APP:auth-refresh:MAIN:at", String(Date.now()));
      return task();
    });
    vi.stubGlobal("navigator", { locks: { request } });
    const refresh = vi.fn(async () => {});
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    await mgr.refresh(sentAt);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("records the rotation for other tabs after a successful refresh", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", {});
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {},
      onRefreshFailed: () => {},
    });

    await mgr.refresh(Date.now());
    expect(Number(storage.getItem("PRISM_APP:auth-refresh:MAIN:at"))).toBeGreaterThan(0);
  });

  it("ignores a shared timestamp in the future (clock moved back) and refreshes", async () => {
    const storage = memoryStorage();
    storage.setItem("PRISM_APP:auth-refresh:MAIN:at", String(Date.now() + 60 * 60 * 1000));
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", {});
    const refresh = vi.fn(async () => {});
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    await mgr.refresh(Date.now() - 1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("fires onRefreshed only after a successful network refresh", async () => {
    vi.stubGlobal("navigator", {});
    const onRefreshed = vi.fn();
    const ok = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {},
      onRefreshed,
      onRefreshFailed: () => {},
    });
    await ok.refresh(Date.now());
    expect(onRefreshed).toHaveBeenCalledTimes(1);

    const failing = new RefreshTokenManager({
      service: "MAIN",
      refresh: () => Promise.reject(new Error("revoked")),
      onRefreshed,
      onRefreshFailed: () => {},
    });
    await expect(failing.refresh(Date.now())).rejects.toThrow("revoked");
    expect(onRefreshed).toHaveBeenCalledTimes(1);
  });

  it("falls back to an unlocked refresh when navigator.locks is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const refresh = vi.fn(async () => {});
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    await mgr.refresh(Date.now());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
