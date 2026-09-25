import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import {
  RefreshTokenManager,
  SESSION_WAIT_TIMEOUT_MS,
  withSessionLock,
} from "@/services/core/refresh-token-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("withSessionLock without the Web Locks API", () => {
  beforeEach(() => {
    installLocalStorage();
    vi.stubGlobal("navigator", {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs the task synchronously when no refresh is in flight", () => {
    const task = vi.fn(async () => "done");
    void withSessionLock("MAIN", task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("waits for this tab's in-flight refresh of the same service before running", async () => {
    const events: string[] = [];
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        await tick();
        events.push("refresh");
        return { accessToken: "AT2" };
      },
      onRefreshFailed: () => {},
    });

    const refreshing = mgr.getFreshToken();
    await withSessionLock("MAIN", async () => void events.push("task"));
    await refreshing;

    expect(events).toEqual(["refresh", "task"]);
  });

  it("does not wait for a refresh of another service", async () => {
    const mgr = new RefreshTokenManager({
      service: "ADMIN",
      refresh: () => new Promise(() => {}),
      onRefreshFailed: () => {},
    });
    void mgr.getFreshToken().catch(() => {});

    const task = vi.fn(async () => "done");
    void withSessionLock("MAIN", task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("gives up waiting for a hung refresh after the cap and runs the task", async () => {
    vi.useFakeTimers();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: () => new Promise(() => {}),
      onRefreshFailed: () => {},
    });
    void mgr.getFreshToken().catch(() => {});
    const task = vi.fn(async () => "done");

    const locked = withSessionLock("MAIN", task);
    await vi.advanceTimersByTimeAsync(SESSION_WAIT_TIMEOUT_MS - 1);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(locked).resolves.toBe("done");
  });
});
