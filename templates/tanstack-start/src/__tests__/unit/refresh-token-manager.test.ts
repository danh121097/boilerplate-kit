import { installFakeLocks } from "@/__tests__/helpers/fake-web-locks";
import { APP_PREFIX } from "@/enums";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { afterEach, describe, expect, it, vi } from "vitest";

const tick = () => new Promise((r) => setTimeout(r, 5));

/** Shared in-memory localStorage (one per "browser", shared by its tabs). */
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe("RefreshTokenManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("serializes refreshes across tabs and skips one another tab already did", async () => {
    const request = installFakeLocks();
    installLocalStorage();
    let runs = 0;
    const tab = () =>
      new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          runs += 1;
          await tick();
        },
        onRefreshFailed: () => {},
      });

    // Two tabs hit a 401 at the same moment; each has its own manager.
    const tabA = tab();
    const tabB = tab();
    await Promise.all([tabA.refresh(), tabB.refresh()]);

    expect(request).toHaveBeenCalledTimes(2); // both went through the lock
    expect(runs).toBe(1); // …but only one network refresh (rotation reused)
  });

  it("stamps the last refresh under the app-prefixed lock name plus :at", async () => {
    installFakeLocks();
    const store = installLocalStorage();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {},
      onRefreshFailed: () => {},
    });

    await mgr.refresh();

    expect(Number(store.get(`${APP_PREFIX}:auth-refresh:MAIN:at`))).toBeGreaterThan(0);
    expect([...store.keys()]).toEqual([`${APP_PREFIX}:auth-refresh:MAIN:at`]);
  });

  it("falls back to a plain refresh when the Web Locks API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    let runs = 0;
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        runs += 1;
      },
      onRefreshFailed: () => {},
    });

    await mgr.refresh();
    expect(runs).toBe(1);
  });

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

  it.each([401, 403])(
    "fires onRefreshFailed and rethrows when the refresh is refused (%i)",
    async (status) => {
      const onRefreshFailed = vi.fn();
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          throw Object.assign(new Error("refresh failed"), { response: { status } });
        },
        onRefreshFailed,
      });

      await expect(mgr.refresh()).rejects.toThrow("refresh failed");
      expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["network error", { code: "ERR_NETWORK" }],
    ["503", { response: { status: 503 } }],
    ["429", { response: { status: 429 } }],
  ])("only rethrows on a transient failure (%s) — session kept", async (_label, extra) => {
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw Object.assign(new Error("refresh failed"), extra);
      },
      onRefreshFailed,
    });

    await expect(mgr.refresh()).rejects.toThrow("refresh failed");
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });
});
