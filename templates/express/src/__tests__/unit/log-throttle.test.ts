import { createLogThrottle } from "@/utils/log-throttle";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

describe("createLogThrottle", () => {
  it("logs a message once per interval", () => {
    vi.useFakeTimers();
    const shouldLog = createLogThrottle(1000);
    expect(shouldLog("a")).toBe(true);
    expect(shouldLog("a")).toBe(false);
    expect(shouldLog("b")).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(shouldLog("a")).toBe(true);
  });

  it("remembers a bounded number of messages and evicts the oldest", () => {
    vi.useFakeTimers();
    const shouldLog = createLogThrottle(60_000);
    for (let i = 0; i < 100; i++) shouldLog(`m${i}`);
    expect(shouldLog("m99")).toBe(false);
    expect(shouldLog("m0")).toBe(false);
    // 101st distinct key evicts the oldest ("m0"), which then logs again.
    expect(shouldLog("m100")).toBe(true);
    expect(shouldLog("m0")).toBe(true);
    expect(shouldLog("m99")).toBe(false);
  });
});
