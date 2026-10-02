import { config } from "@/config/environment";
import { STORE_ERROR_LOG_INTERVAL_MS, globalRateLimitOptions } from "@/plugins/rate-limit";
import { logger } from "@/utils/logger";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A Redis client that is down: with the offline queue off every command rejects at once.
vi.mock("@/config/redis", async () => {
  const { default: Redis } = await import("ioredis");
  const client = new Redis("redis://127.0.0.1:1", {
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  return { getRedis: () => client };
});

describe("rate-limit store failures during a Redis outage", () => {
  const warn = vi.spyOn(logger, "warn");
  const originalIsTest = config.isTest;

  beforeEach(() => {
    config.isTest = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    // Move past any window opened by an earlier test in this file.
    vi.setSystemTime(Date.now() + 10 * STORE_ERROR_LOG_INTERVAL_MS);
    warn.mockClear();
  });
  afterEach(() => {
    config.isTest = originalIsTest;
    vi.useRealTimers();
  });

  async function hit(count: number): Promise<number[]> {
    const app = Fastify();
    await app.register(rateLimit, { ...globalRateLimitOptions(), allowList: () => false });
    app.get("/ping", async () => ({ ok: true }));
    const statuses: number[] = [];
    for (let i = 0; i < count; i++) {
      statuses.push((await app.inject({ method: "GET", url: "/ping" })).statusCode);
    }
    await app.close();
    return statuses;
  }

  it("fails open and logs one concise warning per interval, without a stack", async () => {
    expect(await hit(5)).toEqual([200, 200, 200, 200, 200]);

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, meta] = warn.mock.calls[0];
    expect(message).toMatch(/Rate-limit store unavailable/);
    expect(meta).toEqual({ reason: expect.any(String) });
    expect(JSON.stringify(meta)).not.toMatch(/\bat \S+ \(/);

    vi.setSystemTime(Date.now() + STORE_ERROR_LOG_INTERVAL_MS + 1);
    expect(await hit(2)).toEqual([200, 200]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
