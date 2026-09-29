import { createServer, type Server as HttpServer } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Redis enabled but unreachable (outage): socket emits/disconnects go through the
 * Redis adapter, whose fire-and-forget publish rejects. None of that may surface as
 * an unhandled rejection (which would exit the process) or slow the caller down.
 */

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};

let httpServer: HttpServer;
let socketModule: typeof import("@/socket");
let emitModule: typeof import("@/utils/socket-emit");
let redisModule: typeof import("@/config/redis");

beforeAll(async () => {
  vi.stubEnv("REDIS_ENABLED", "true");
  // Nothing listens on port 1: every command fails as it would in an outage.
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
  vi.resetModules();
  redisModule = await import("@/config/redis");
  socketModule = await import("@/socket");
  emitModule = await import("@/utils/socket-emit");

  process.on("unhandledRejection", onUnhandled);
  redisModule.connectRedis();
  httpServer = createServer();
  socketModule.initSocket(httpServer);
});

afterAll(async () => {
  process.off("unhandledRejection", onUnhandled);
  await socketModule.closeSocket();
  redisModule.getRedis()?.disconnect();
  vi.unstubAllEnvs();
});

describe("socket helpers during a Redis outage", () => {
  it("disconnect/emit never throw, resolve promptly and raise no unhandled rejection", async () => {
    const started = Date.now();
    expect(() => emitModule.disconnectUserSockets("u1")).not.toThrow();
    expect(() => emitModule.emitToUser("u1", "ping" as never, {})).not.toThrow();
    expect(() => emitModule.emitBroadcast("ping" as never, {})).not.toThrow();

    // Let the adapter's pending publishes settle (MaxRetriesPerRequestError etc).
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(unhandled).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 15000);

  it("logout still succeeds promptly and raises no unhandled rejection", async () => {
    const { register, logout } = await import("@/modules/auth/service");
    const { tokens } = await register("outage@example.com", "Password1!", "Outage");
    unhandled.length = 0;

    const started = Date.now();
    await expect(logout(tokens.refreshToken)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(unhandled).toEqual([]);
  }, 15000);

  it("closing while the subscriber is still connecting raises no unhandled rejection", async () => {
    await socketModule.closeSocket();
    unhandled.length = 0;

    // Fresh subscriber: the adapter's (p)subscribe are still queued on it.
    socketModule.initSocket(createServer());
    await socketModule.closeSocket();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(unhandled).toEqual([]);
  }, 15000);
});
