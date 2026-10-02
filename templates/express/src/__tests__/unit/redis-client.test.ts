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
    disconnect = vi.fn();
    status = "ready";
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
      expect.objectContaining({
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        commandTimeout: 1000,
      }),
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

describe("redis client — shutdown while Redis is down", () => {
  it("disconnects instead of quitting when the client is not ready and never rejects", async () => {
    process.env.REDIS_ENABLED = "true";
    const { connectRedis, disconnectRedis, getRedis } = await import("@/config/redis");
    connectRedis();
    const client = getRedis() as unknown as {
      status: string;
      quit: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    };
    client.status = "reconnecting";
    client.quit = vi.fn().mockRejectedValue(new Error("Stream isn't writeable"));
    client.disconnect = vi.fn();

    await expect(disconnectRedis()).resolves.toBeUndefined();
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(getRedis()).toBeNull();
  });

  it("falls back to disconnect when QUIT fails on a ready client", async () => {
    process.env.REDIS_ENABLED = "true";
    const { connectRedis, disconnectRedis, getRedis } = await import("@/config/redis");
    connectRedis();
    const client = getRedis() as unknown as {
      status: string;
      quit: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    };
    client.status = "ready";
    client.quit = vi.fn().mockRejectedValue(new Error("boom"));
    client.disconnect = vi.fn();

    await expect(disconnectRedis()).resolves.toBeUndefined();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });
});

describe("redis client — outage error logging", () => {
  afterEach(() => vi.useRealTimers());

  it("logs one stackless line per distinct message per minute", async () => {
    vi.useFakeTimers();
    process.env.REDIS_ENABLED = "true";
    const { logger } = await import("@/utils/logger");
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { connectRedis } = await import("@/config/redis");
    connectRedis();
    const onError = onSpy.mock.calls.find(([event]) => event === "error")?.[1] as (
      e: Error,
    ) => void;

    const refused = new Error("connect ECONNREFUSED 127.0.0.1:6379");
    for (let i = 0; i < 5; i++) {
      onError(refused);
      vi.advanceTimersByTime(1400);
    }
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith("Redis error: connect ECONNREFUSED 127.0.0.1:6379");

    onError(new Error("getaddrinfo ENOTFOUND redis"));
    expect(errorLog).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    onError(refused);
    expect(errorLog).toHaveBeenCalledTimes(3);
  });
});
