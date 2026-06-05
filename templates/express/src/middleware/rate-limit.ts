import rateLimit, { type RateLimitRequestHandler, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";

const isTest = config.isTest;

/**
 * Build a Redis-backed store when Redis is enabled so rate-limit counters are
 * shared across instances; otherwise return undefined to let express-rate-limit
 * use its in-memory MemoryStore (correct for single-instance / Redis-off).
 * A distinct `prefix` per limiter keeps their counters from colliding in Redis.
 */
export function makeStore(prefix: string): Store | undefined {
  const client = getRedis();
  if (!client) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) =>
      client.call(command, ...args) as Promise<never>,
  });
}

/** Default limit for all API routes: 100 requests per minute */
export const globalRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  store: makeStore("rl:global:"),
  // Fail-open: a Redis outage must not 500 the endpoint.
  passOnStoreError: true,
  message: {
    success: false,
    message: "Too many requests, please try again later!",
  },
});

/** General rate limit for auth endpoints: 20 requests per 15 minutes */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  store: makeStore("rl:auth:"),
  // Fail-open: a Redis outage must not 500 the endpoint.
  passOnStoreError: true,
  message: {
    success: false,
    message: "Too many requests, please try again later!",
  },
});

/** Stricter limit for login: 10 requests per 15 minutes (brute force protection) */
export const loginRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  store: makeStore("rl:login:"),
  // Fail-open: a Redis outage must not 500 the endpoint.
  passOnStoreError: true,
  message: {
    success: false,
    message: "Too many login attempts, please try again later!",
  },
});
