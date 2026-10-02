import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";
import { AppError } from "@/types";
import { logger } from "@/utils/logger";
import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";
import type { Redis } from "ioredis";

export const TOO_MANY_REQUESTS = "Too many requests, please try again later!";
export const TOO_MANY_LOGINS = "Too many login attempts, please try again later!";

/** Minimum gap between rate-limit store failure warnings (a Redis outage fails every request). */
export const STORE_ERROR_LOG_INTERVAL_MS = 60_000;
let lastStoreErrorLoggedAt = Number.NEGATIVE_INFINITY;

/**
 * The plugin fails open on a store error (`skipOnError`) and says nothing, so a Redis
 * outage would go unnoticed per request. Hand it a view of the client whose
 * rate-limit command reports a failure as one concise warning (reason only, no stack)
 * per interval, then lets the error through so the plugin still fails open.
 */
export function withStoreErrorLogging(client: Redis): Redis {
  return new Proxy(client, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      const fn = value.bind(target);
      if (prop !== "rateLimit") return fn;
      return (...args: unknown[]): unknown => {
        const callback = args.at(-1);
        if (typeof callback !== "function") return fn(...args);
        return fn(...args.slice(0, -1), (err: Error | null, result: unknown) => {
          if (err) logStoreError(err);
          callback(err, result);
        });
      };
    },
  });
}

function logStoreError(err: Error): void {
  const now = Date.now();
  if (now - lastStoreErrorLoggedAt < STORE_ERROR_LOG_INTERVAL_MS) return;
  lastStoreErrorLoggedAt = now;
  logger.warn("Rate-limit store unavailable; allowing requests without rate limiting", {
    reason: err.message,
  });
}

/** Request-time check so tests can flip `config.isTest` to exercise the limiters. */
function isExempt(request: FastifyRequest, apiOnly: boolean): boolean {
  if (config.isTest) return true;
  if (!apiOnly) return false;
  return !(request.url === config.apiPrefix || request.url.startsWith(`${config.apiPrefix}/`));
}

function redisForLimiter(): Redis | undefined {
  const client = getRedis();
  return client ? withStoreErrorLogging(client) : undefined;
}

/**
 * Options for one `@fastify/rate-limit` registration. Each registration owns a single
 * store, so every route in its encapsulated scope shares one counter per client IP.
 * `nameSpace` keeps the Redis keys of separate limiters from colliding. Fails open
 * (`skipOnError`) so a Redis outage never 500s an endpoint, and trips with the
 * standard 429 `RATE_LIMIT` envelope via the global error handler.
 */
export function rateLimitOptions(opts: {
  max: number;
  timeWindow: number;
  nameSpace: string;
  message: string;
  apiOnly?: boolean;
}): RateLimitPluginOptions {
  return {
    global: true,
    max: opts.max,
    timeWindow: opts.timeWindow,
    nameSpace: opts.nameSpace,
    skipOnError: true,
    allowList: (request) => isExempt(request, opts.apiOnly ?? false),
    redis: redisForLimiter(),
    errorResponseBuilder: () =>
      new AppError({ message: opts.message, statusCode: 429, errorType: "RATE_LIMIT" }),
  };
}

/** Default limit for all API routes: 100 requests per minute. */
export function globalRateLimitOptions(): RateLimitPluginOptions {
  return rateLimitOptions({
    max: 100,
    timeWindow: 60_000,
    nameSpace: "rl:global:",
    message: TOO_MANY_REQUESTS,
    apiOnly: true,
  });
}

/** register + refresh + logout share one bucket: 30 requests per 15 minutes. */
export function authRateLimitOptions(): RateLimitPluginOptions {
  return rateLimitOptions({
    max: 30,
    timeWindow: 15 * 60_000,
    nameSpace: "rl:auth:",
    message: TOO_MANY_REQUESTS,
  });
}

/** Login has its own bucket: 30 requests per 15 minutes (brute-force protection). */
export function loginRateLimitOptions(): RateLimitPluginOptions {
  return rateLimitOptions({
    max: 30,
    timeWindow: 15 * 60_000,
    nameSpace: "rl:login:",
    message: TOO_MANY_LOGINS,
  });
}
