import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { afterEach, describe, expect, it, vi } from "vitest";

const tick = () => new Promise((r) => setTimeout(r, 5));

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

  it("fires onRefreshFailed and rethrows when refresh rejects", async () => {
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw new Error("refresh failed");
      },
      onRefreshFailed,
    });

    await expect(mgr.refresh()).rejects.toThrow("refresh failed");
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
  });
});
