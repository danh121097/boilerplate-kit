/**
 * Shutdown of the shared Redis client (RedisModule.onModuleDestroy): QUIT when ready,
 * fall back to disconnect when QUIT fails, drop a not-ready client, no-op when disabled.
 */
import { describe, expect, it, vi } from "vitest";

import { RedisModule } from "@/redis/redis.module";
import type { RedisService } from "@/redis/redis.service";

function destroy(client: unknown): Promise<void> {
  return new RedisModule({ getClient: () => client } as unknown as RedisService).onModuleDestroy();
}

describe("RedisModule.onModuleDestroy", () => {
  it("quits a ready client", async () => {
    const client = { status: "ready", quit: vi.fn().mockResolvedValue("OK"), disconnect: vi.fn() };
    await destroy(client);
    expect(client.quit).toHaveBeenCalledOnce();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("does not resolve until QUIT has completed", async () => {
    let finishQuit!: () => void;
    const quit = vi.fn(() => new Promise<string>((resolve) => (finishQuit = () => resolve("OK"))));
    const client = { status: "ready", quit, disconnect: vi.fn() };
    let settled = false;
    const done = destroy(client).then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    finishQuit();
    await done;
    expect(settled).toBe(true);
  });

  it("disconnects when QUIT rejects, without an unhandled rejection", async () => {
    const client = {
      status: "ready",
      quit: vi.fn().mockRejectedValue(new Error("closed")),
      disconnect: vi.fn(),
    };
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      await destroy(client);
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off("unhandledRejection", unhandled);
    }
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("disconnects a client that is not ready instead of sending QUIT", async () => {
    const client = { status: "connecting", quit: vi.fn(), disconnect: vi.fn() };
    await destroy(client);
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it("does nothing when Redis is disabled", async () => {
    await expect(destroy(null)).resolves.toBeUndefined();
  });
});
