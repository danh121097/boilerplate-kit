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

describe("redis client — connection error logging", () => {
  it("logs one concise line per distinct message per interval, without a stack", async () => {
    process.env.REDIS_ENABLED = "true";
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { logger } = await import("@/utils/logger");
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
      const { CONNECTION_ERROR_LOG_INTERVAL_MS, connectRedis } = await import("@/config/redis");
      connectRedis();
      const handler = onSpy.mock.calls.find(([event]) => event === "error")?.[1] as (
        err: Error,
      ) => void;

      handler(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
      handler(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
      handler(new Error("other failure"));
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(1, "Redis error", {
        reason: "connect ECONNREFUSED 127.0.0.1:6379",
      });

      vi.setSystemTime(Date.now() + CONNECTION_ERROR_LOG_INTERVAL_MS);
      handler(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds the log throttle map by evicting the oldest key", async () => {
    vi.useFakeTimers();
    try {
      const { logger } = await import("@/utils/logger");
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
      const { MAX_LOG_THROTTLE_KEYS, logRedisConnectionError } = await import("@/config/redis");

      logRedisConnectionError("Redis error", new Error("first"));
      for (let i = 0; i < MAX_LOG_THROTTLE_KEYS; i++) {
        logRedisConnectionError("Redis error", new Error(`other ${i}`));
      }
      expect(warn).toHaveBeenCalledTimes(MAX_LOG_THROTTLE_KEYS + 1);

      // "first" was evicted, so it logs again inside the interval; a recent key is still throttled.
      logRedisConnectionError("Redis error", new Error("first"));
      expect(warn).toHaveBeenCalledTimes(MAX_LOG_THROTTLE_KEYS + 2);
      logRedisConnectionError("Redis error", new Error(`other ${MAX_LOG_THROTTLE_KEYS - 1}`));
      expect(warn).toHaveBeenCalledTimes(MAX_LOG_THROTTLE_KEYS + 2);
    } finally {
      vi.useRealTimers();
    }
  });
});
