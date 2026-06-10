import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Redis client wrapper must be safe whether Redis is on or off. These tests
 * drive both branches by toggling REDIS_ENABLED and re-importing the module with
 * a mocked ioredis so no real network connection is attempted.
 */

// Minimal ioredis stand-in: records construction, exposes on/quit.
const onSpy = vi.fn();
const quitSpy = vi.fn().mockResolvedValue("OK");
const ctorSpy = vi.fn();

vi.mock("ioredis", () => ({
  default: class {
    on = onSpy;
    quit = quitSpy;
    constructor(...args: unknown[]) {
      ctorSpy(...args);
    }
  },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("redis client — disabled", () => {
  it("connectRedis is a no-op and getRedis returns null", async () => {
    process.env.REDIS_ENABLED = "false";
    const { connectRedis, getRedis } = await import("@/config/redis");

    expect(() => connectRedis()).not.toThrow();
    expect(getRedis()).toBeNull();
    expect(ctorSpy).not.toHaveBeenCalled();
  });

  it("disconnectRedis is safe when never connected", async () => {
    process.env.REDIS_ENABLED = "false";
    const { disconnectRedis } = await import("@/config/redis");

    await expect(disconnectRedis()).resolves.toBeUndefined();
    expect(quitSpy).not.toHaveBeenCalled();
  });
});

describe("redis client — enabled", () => {
  it("connectRedis creates a client and getRedis returns it", async () => {
    process.env.REDIS_ENABLED = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    const { connectRedis, getRedis } = await import("@/config/redis");

    connectRedis();

    expect(ctorSpy).toHaveBeenCalledTimes(1);
    expect(ctorSpy).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({ maxRetriesPerRequest: 2 }),
    );
    expect(getRedis()).not.toBeNull();
  });

  it("disconnectRedis quits and clears the client", async () => {
    process.env.REDIS_ENABLED = "true";
    const { connectRedis, getRedis, disconnectRedis } = await import("@/config/redis");

    connectRedis();
    await disconnectRedis();

    expect(quitSpy).toHaveBeenCalledTimes(1);
    expect(getRedis()).toBeNull();
  });
});
