import type { INestApplication } from "@nestjs/common";
import { vi } from "vitest";
import Redis from "ioredis";
import net from "node:net";
import supertest from "supertest";
import { addBearerToken, buildHmacHeaders } from "../helpers/sign-request";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * The lane deletes the app's keys between tests, so it refuses any Redis that is not on this
 * machine unless REDIS_TEST_ALLOW_REMOTE=true. Throws (the suite fails) rather than skipping.
 */
function resolveLaneRedisUrl(raw: string): string {
  if (!raw) return "";
  let hostname: string;
  try {
    hostname = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error("[test:redis] REDIS_URL is not a valid URL.");
  }
  if (!LOOPBACK_HOSTS.has(hostname) && process.env.REDIS_TEST_ALLOW_REMOTE !== "true") {
    throw new Error(
      `[test:redis] Refusing to run: REDIS_URL host "${hostname}" is not loopback and the lane deletes keys on it. ` +
        "Point REDIS_URL at a disposable local Redis, or set REDIS_TEST_ALLOW_REMOTE=true to accept a remote one.",
    );
  }
  return raw;
}

/** Redis the lane runs against (`pnpm test:redis` is a no-op without it). Loopback only by default. */
export const REDIS_URL = resolveLaneRedisUrl(process.env.REDIS_URL ?? "");

export interface AppInstance {
  /** Perform an HMAC-signed request against this instance. */
  call: (
    method: "get" | "post",
    path: string,
    opts?: { body?: Record<string, unknown>; token?: string },
  ) => supertest.Test;
  redisStatus: () => string | undefined;
  stop: () => Promise<void>;
}

/**
 * Boot one full copy of the app with its own Redis client, throttler storage and HTTP
 * server. Booting two copies against the same Redis stands in for two replicas behind a
 * load balancer.
 */
export async function bootInstance(redisUrl: string): Promise<AppInstance> {
  vi.stubEnv("REDIS_ENABLED", "true");
  vi.stubEnv("REDIS_URL", redisUrl);
  // The app reads its environment when its modules load, so import a fresh copy after the stubs.
  vi.resetModules();
  const { AppThrottlerGuard } = await import("@/common/throttler/throttler.module");
  const { RedisService } = await import("@/redis/redis.service");
  const { createTestApp } = await import("../helpers/create-test-app");
  // The throttler guard skips every request under NODE_ENV=test; this lane exercises it.
  vi.spyOn(
    AppThrottlerGuard.prototype as unknown as { shouldSkip: () => Promise<boolean> },
    "shouldSkip",
  ).mockResolvedValue(false);

  const app: INestApplication = await createTestApp();
  const client = (): Redis | null => app.get(RedisService).getClient();
  await waitForReady(() => client()?.status);
  const agent = supertest(app.getHttpServer());

  return {
    call: (method, path, opts = {}) => {
      const headers = buildHmacHeaders(method, path, opts.body);
      const signed = opts.token ? addBearerToken(headers, opts.token) : headers;
      let req = agent[method](`/api/v1${path}`).set("sig", signed.sig).set("ctime", signed.ctime);
      if (opts.token) req = req.set("Authorization", `Bearer ${opts.token}`);
      return opts.body ? req.set("Content-Type", "application/json").send(opts.body) : req;
    },
    redisStatus: () => client()?.status,
    stop: () => app.close(),
  };
}

export async function waitForReady(
  status: () => string | undefined,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (status() !== "ready") {
    if (Date.now() > deadline) throw new Error(`Redis client not ready (status: ${status()})`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function waitForDown(
  status: () => string | undefined,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (status() === "ready") {
    if (Date.now() > deadline)
      throw new Error("Redis client still ready after the connection was cut");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const KEY_PATTERNS = ["{default:*", "{login:*", "{auth:*", "revoked:user:*"];

/** Remove the keys the app writes (throttler counters, revocation cutoffs) between tests. */
export async function clearAppKeys(redisUrl: string): Promise<void> {
  resolveLaneRedisUrl(redisUrl);
  const admin = new Redis(redisUrl);
  try {
    for (const pattern of KEY_PATTERNS) {
      for await (const keys of admin.scanStream({ match: pattern, count: 200 }) as AsyncIterable<
        string[]
      >) {
        if (keys.length) await admin.del(...keys);
      }
    }
  } finally {
    admin.disconnect();
  }
}

export interface TcpProxy {
  url: string;
  /** Drop every connection and refuse new ones: Redis looks down to the app. */
  stop: () => Promise<void>;
  /** Accept connections again on the same port. */
  start: () => Promise<void>;
}

/** Same credentials and database as the target, pointed at the local proxy port. */
function proxyUrl(target: URL, port: number): string {
  const url = new URL(target.href);
  url.hostname = "127.0.0.1";
  url.port = String(port);
  return url.href;
}

/** TCP forwarder in front of Redis so a test can cut and restore the connection on demand. */
export async function startRedisProxy(redisUrl: string): Promise<TcpProxy> {
  const target = new URL(redisUrl);
  if (target.protocol === "rediss:") {
    throw new Error("[test:redis] The outage scenario does not support rediss:// (TLS) URLs.");
  }
  const upstreamHost = target.hostname.replace(/^\[|\]$/g, "");
  const sockets = new Set<net.Socket>();
  let server!: net.Server;

  const listen = (port: number): Promise<void> => {
    server = net.createServer((client) => {
      const upstream = net.connect(Number(target.port || 6379), upstreamHost);
      for (const s of [client, upstream]) {
        sockets.add(s);
        s.on("close", () => sockets.delete(s));
        s.on("error", () => s.destroy());
      }
      client.pipe(upstream);
      upstream.pipe(client);
    });
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  };

  await listen(0);
  const port = (server.address() as net.AddressInfo).port;
  return {
    url: proxyUrl(target, port),
    stop: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    start: () => listen(port),
  };
}
