/**
 * Redis outage safety: cache, health and rate-limit storage answer at once when the
 * client is not ready, and socket emit/disconnect failures never escape as
 * unhandled rejections.
 */
import { describe, expect, it, vi } from "vitest";

import { AppLogger } from "@/common/logger/app-logger.service";
import {
  AppThrottlerGuard,
  ReadyGuardedThrottlerStorage,
} from "@/common/throttler/throttler.module";
import { CacheService } from "@/common/services/cache.service";
import { SocketEmitService } from "@/modules/realtime/socket-emit.service";
import { HealthController } from "@/modules/health/health.controller";
import { RedisService } from "@/redis/redis.service";
import { createSafePubClient } from "@/redis/safe-pub-client";
import type { Redis } from "ioredis";

const notReady = () => {
  const client = { status: "connecting", get: vi.fn(), set: vi.fn(), del: vi.fn(), ping: vi.fn() };
  return { client, redis: { getClient: () => client } as unknown as RedisService };
};

describe("not-ready client short-circuits", () => {
  it("cache get/set/del return immediately without a Redis call", async () => {
    const { client, redis } = notReady();
    const cache = new CacheService(redis, { warn: vi.fn() } as unknown as AppLogger);
    expect(await cache.get("k")).toBeNull();
    await cache.set("k", 1, 10);
    await cache.del("k");
    expect(client.get).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
    expect(client.del).not.toHaveBeenCalled();
  });

  it("health reports redis down without PING", async () => {
    const { client, redis } = notReady();
    const health = new HealthController({ readyState: 1 } as never, redis);
    expect((await health.check()).redis).toBe("down");
    expect(client.ping).not.toHaveBeenCalled();
  });
});

describe("SocketEmitService never throws or rejects", () => {
  it("swallows sync throws and async rejections from every path, logging at warn", async () => {
    const rejecting = { disconnectSockets: () => Promise.reject(new Error("publish failed")) };
    const throwing = {
      emit: () => {
        throw new Error("sync boom");
      },
    };
    const server = {
      to: () => throwing,
      emit: () => Promise.reject(new Error("broadcast failed")),
      in: () => rejecting,
      local: { in: () => rejecting },
    };
    const warn = vi.fn();
    const svc = new SocketEmitService({ server } as never, { warn } as unknown as AppLogger);

    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      svc.emitToUser("u1", "x" as never);
      svc.emitBroadcast("x" as never);
      svc.disconnectUser("u1");
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.off("unhandledRejection", unhandled);
    }
    expect(unhandled).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(4);
  });
});

describe("createSafePubClient", () => {
  it("turns a rejected publish into 0 and passes other calls through bound to the client", async () => {
    const pub = {
      publish: vi.fn().mockRejectedValue(new Error("down")),
      status: "ready",
      duplicate() {
        return this;
      },
    };
    const warn = vi.fn();
    const safe = createSafePubClient(pub as unknown as Redis, warn);
    expect(await safe.publish("ch", "msg")).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(safe.status).toBe("ready");
    expect(safe.duplicate()).toBe(pub);
  });
});

describe("rate-limit storage with a not-ready client", () => {
  it("increment rejects without touching Redis and the guard fails open", async () => {
    const client = { status: "connecting", call: vi.fn() };
    const storage = new ReadyGuardedThrottlerStorage(client as unknown as Redis);
    await expect(storage.increment("k", 1000, 5, 0, "default")).rejects.toThrow("Redis not ready");
    expect(client.call).not.toHaveBeenCalled();

    const guard = new AppThrottlerGuard({ throttlers: [] }, storage, {} as never);
    await guard.onModuleInit();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: "1.1.1.1" }),
        getResponse: () => ({}),
      }),
    };
    const allowed = await (
      guard as unknown as { handleRequest(p: unknown): Promise<boolean> }
    ).handleRequest({
      context,
      limit: 5,
      ttl: 1000,
      blockDuration: 0,
      throttler: { name: "default" },
      getTracker: async () => "1.1.1.1",
      generateKey: () => "k",
    });
    expect(allowed).toBe(true);
    expect(client.call).not.toHaveBeenCalled();
  });
});
