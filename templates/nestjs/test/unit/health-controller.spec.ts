/**
 * HealthController status mapping: MongoDB readyState names and the Redis
 * disabled / up / down states.
 */
import { describe, expect, it, vi } from "vitest";

import { HealthController } from "@/modules/health/health.controller";
import type { RedisService } from "@/redis/redis.service";

const redisWith = (client: unknown) => ({ getClient: () => client }) as unknown as RedisService;

describe("HealthController", () => {
  it("reports ok with timestamp, uptime and redis disabled when Redis is off", async () => {
    const res = await new HealthController({ readyState: 1 } as never, redisWith(null)).check();
    expect(res).toMatchObject({ status: "ok", database: "connected", redis: "disabled" });
    expect(new Date(res.timestamp).toISOString()).toBe(res.timestamp);
    expect(res.uptime).toBeGreaterThan(0);
  });

  it.each([
    [0, "disconnected"],
    [1, "connected"],
    [2, "connecting"],
    [3, "disconnecting"],
    [99, "unknown"],
  ])("maps mongoose readyState %i to %s", async (state, name) => {
    const res = await new HealthController({ readyState: state } as never, redisWith(null)).check();
    expect(res.database).toBe(name);
  });

  it("reports redis up on a successful PING and down when PING fails", async () => {
    const ping = vi.fn().mockResolvedValueOnce("PONG").mockRejectedValueOnce(new Error("x"));
    const ctrl = new HealthController(
      { readyState: 1 } as never,
      redisWith({ status: "ready", ping }),
    );
    expect((await ctrl.check()).redis).toBe("up");
    expect((await ctrl.check()).redis).toBe("down");
  });
});
