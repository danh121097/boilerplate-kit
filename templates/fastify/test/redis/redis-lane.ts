import { signHeaders } from "../helpers/sign-request";
import { vi } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import Redis from "ioredis";
import mongoose from "mongoose";
import net from "node:net";

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

const API = "/api/v1";

export interface AppInstance {
  /** Perform an HMAC-signed request against this instance. */
  call: (
    method: "GET" | "POST",
    path: string,
    opts?: { body?: Record<string, unknown>; token?: string },
  ) => Promise<LightMyRequestResponse>;
  redisStatus: () => string | undefined;
  stop: () => Promise<void>;
}

/**
 * Boot one isolated copy of the app: a fresh module graph with its own Redis client and
 * limiter stores. Booting two copies against the same Redis stands in for two replicas
 * behind a load balancer.
 */
export async function bootInstance(redisUrl: string): Promise<AppInstance> {
  vi.stubEnv("REDIS_ENABLED", "true");
  vi.stubEnv("REDIS_URL", redisUrl);
  vi.resetModules();
  // mongoose is a shared Node module, so the models a previous copy registered would clash.
  for (const name of mongoose.modelNames()) mongoose.deleteModel(name);

  const redisModule = await import("@/config/redis");
  redisModule.connectRedis();
  const { buildApp } = await import("@/app");
  const { config } = await import("@/config/environment");
  const app = buildApp({ sockets: false });
  await app.ready();
  // The limiters skip every request while config.isTest is set; this lane exercises them.
  config.isTest = false;

  const client = redisModule.getRedis()!;
  await waitForReady(() => client.status);

  return {
    call: (method, path, opts = {}) =>
      app.inject({
        method,
        url: `${API}${path}`,
        payload: opts.body,
        headers: {
          ...signHeaders(method, path, opts.body),
          ...(opts.token && { authorization: `Bearer ${opts.token}` }),
        },
      }),
    redisStatus: () => redisModule.getRedis()?.status,
    stop: async () => {
      await app.close();
      await redisModule.disconnectRedis();
    },
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

const KEY_PATTERNS = ["rl:*", "revoked:user:*"];

/** Remove the keys the app writes (rate-limit counters, revocation cutoffs) between tests. */
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
