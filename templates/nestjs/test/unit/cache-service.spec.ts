/**
 * CacheService with a ready Redis client: JSON round-trip, TTL, and fail-open on errors.
 * (Disabled and not-ready clients are covered by the redis-outage and no-redis specs.)
 */
import { describe, expect, it, vi } from "vitest";

import type { AppLogger } from "@/common/logger/app-logger.service";
import { CacheService } from "@/common/services/cache.service";
import type { RedisService } from "@/redis/redis.service";

function makeCache() {
  const client = { status: "ready", get: vi.fn(), set: vi.fn(), del: vi.fn() };
  const warn = vi.fn();
  const cache = new CacheService(
    { getClient: () => client } as unknown as RedisService,
    { warn } as unknown as AppLogger,
  );
  return { cache, client, warn };
}

describe("CacheService with a ready client", () => {
  it("stores JSON with an EX ttl and parses it back on get", async () => {
    const { cache, client } = makeCache();
    await cache.set("k", { a: 1 }, 30);
    expect(client.set).toHaveBeenCalledWith("k", '{"a":1}', "EX", 30);

    client.get.mockResolvedValue('{"a":1}');
    expect(await cache.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("returns null on a miss and deletes by key", async () => {
    const { cache, client } = makeCache();
    client.get.mockResolvedValue(null);
    expect(await cache.get("missing")).toBeNull();
    await cache.del("k");
    expect(client.del).toHaveBeenCalledWith("k");
  });

  it("fails open with a warning when Redis errors or the value is not JSON", async () => {
    const { cache, client, warn } = makeCache();
    client.get.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("{not json");
    client.set.mockRejectedValue(new Error("boom"));
    client.del.mockRejectedValue(new Error("boom"));

    expect(await cache.get("k")).toBeNull();
    expect(await cache.get("k")).toBeNull();
    await expect(cache.set("k", 1, 5)).resolves.toBeUndefined();
    await expect(cache.del("k")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(4);
  });
});
