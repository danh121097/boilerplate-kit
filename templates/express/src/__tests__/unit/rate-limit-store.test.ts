import { closeServer, listenOnLoopback } from "@/__tests__/helpers/loopback-server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * makeStore() picks the backing store based on Redis availability: a RedisStore
 * when a client exists, undefined (→ MemoryStore) when Redis is off.
 */

const getRedisMock = vi.fn();
vi.mock("@/config/redis", () => ({ getRedis: () => getRedisMock() }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetModules());

describe("makeStore", () => {
  it("returns undefined when Redis is disabled (MemoryStore fallback)", async () => {
    getRedisMock.mockReturnValue(null);
    const { makeStore } = await import("@/middleware/rate-limit");

    expect(makeStore("rl:test:")).toBeUndefined();
  });

  it("returns a RedisStore when a Redis client is present", async () => {
    // call() must resolve a value: express-rate-limit auto-inits each limiter's
    // store (SCRIPT LOAD via call), and an undefined reply would reject.
    getRedisMock.mockReturnValue({ call: vi.fn(async () => "sha") });
    const { makeStore } = await import("@/middleware/rate-limit");
    const { RedisStore } = await import("rate-limit-redis");

    expect(makeStore("rl:test:")).toBeInstanceOf(RedisStore);
  });

  it("fails open at once when the client is not ready", async () => {
    const call = vi.fn();
    getRedisMock.mockReturnValue({ status: "reconnecting", call });
    const { makeStore } = await import("@/middleware/rate-limit");
    const { default: rateLimit } = await import("express-rate-limit");
    const { default: express } = await import("express");
    const { default: request } = await import("supertest");

    const app = express();
    app.use(rateLimit({ limit: 1, store: makeStore("rl:down:"), passOnStoreError: true }));
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });

    const server = await listenOnLoopback(app);
    try {
      const started = Date.now();
      expect((await request(server).get("/")).status).toBe(200);
      expect((await request(server).get("/")).status).toBe(200);
      expect(Date.now() - started).toBeLessThan(500);
    } finally {
      await closeServer(server);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("logs a store failure as one concise warning per interval and keeps failing open", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    getRedisMock.mockReturnValue({ status: "reconnecting", call: vi.fn() });
    const { config } = await import("@/config/environment");
    const { logger } = await import("@/utils/logger");
    const { globalRateLimiter } = await import("@/middleware/rate-limit");
    const { default: express } = await import("express");
    const { default: request } = await import("supertest");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const isTest = config.isTest;
    config.isTest = false;

    const app = express();
    app.use(globalRateLimiter);
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });
    const server = await listenOnLoopback(app);
    try {
      for (let i = 0; i < 5; i++) expect((await request(server).get("/")).status).toBe(200);

      const storeWarnings = () =>
        warn.mock.calls.filter(([message]) => /store unavailable/.test(message));
      expect(storeWarnings()).toHaveLength(1);
      expect(storeWarnings()[0][1]).toEqual({ reason: "Redis not ready" });
      expect(consoleError).not.toHaveBeenCalled();

      vi.setSystemTime(Date.now() + 61_000);
      expect((await request(server).get("/")).status).toBe(200);
      expect(storeWarnings()).toHaveLength(2);
    } finally {
      config.isTest = isTest;
      await closeServer(server);
      vi.useRealTimers();
    }
  });
});
