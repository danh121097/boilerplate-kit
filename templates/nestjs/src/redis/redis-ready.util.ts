import type { Redis } from "ioredis";

/**
 * True only when the ioredis client is connected and usable. Every Redis-backed
 * operation checks this first so an outage fails open immediately instead of
 * waiting on reconnect/retry logic.
 */
export function isRedisReady(client: Redis | null | undefined): client is Redis {
  return client?.status === "ready";
}
