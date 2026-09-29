import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";
import { AppError } from "@/types";
import rateLimit, { type RateLimitRequestHandler, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { NextFunction, Request, Response } from "express";

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

/** Forward a tripped limit to the global error handler so 429s use the standard envelope. */
export function rateLimitHandler(message: string) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next(new AppError({ message, statusCode: 429, errorType: "RATE_LIMIT" }));
  };
}

function buildLimiter(
  windowMs: number,
  max: number,
  prefix: string,
  message: string,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    store: makeStore(prefix),
    // Fail-open: a Redis outage must not 500 the endpoint.
    passOnStoreError: true,
    handler: rateLimitHandler(message),
  });
}

const TOO_MANY_REQUESTS = "Too many requests, please try again later!";

/** Default limit for all API routes: 100 requests per minute */
export const globalRateLimiter = buildLimiter(60 * 1000, 100, "rl:global:", TOO_MANY_REQUESTS);

/** General rate limit for auth endpoints: 30 requests per 15 minutes */
export const authRateLimiter = buildLimiter(15 * 60 * 1000, 30, "rl:auth:", TOO_MANY_REQUESTS);

/** Login limit: 30 requests per 15 minutes in its own bucket (brute force protection) */
export const loginRateLimiter = buildLimiter(
  15 * 60 * 1000,
  30,
  "rl:login:",
  "Too many login attempts, please try again later!",
);
