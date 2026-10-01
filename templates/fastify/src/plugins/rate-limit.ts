import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";
import { AppError } from "@/types";
import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";

export const TOO_MANY_REQUESTS = "Too many requests, please try again later!";
export const TOO_MANY_LOGINS = "Too many login attempts, please try again later!";

/** Request-time check so tests can flip `config.isTest` to exercise the limiters. */
function isExempt(request: FastifyRequest, apiOnly: boolean): boolean {
  if (config.isTest) return true;
  if (!apiOnly) return false;
  return !(request.url === config.apiPrefix || request.url.startsWith(`${config.apiPrefix}/`));
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
    redis: getRedis() ?? undefined,
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
