import { config } from "./environment";
import { logger } from "@/utils/logger";
import Redis from "ioredis";

/**
 * Single shared Redis client for the whole app (rate-limit, cache, token
 * revocation). It is intentionally OPTIONAL: when REDIS_ENABLED is not true the
 * client stays null and every consumer degrades to its no-Redis behavior.
 * Unlike MongoDB, a Redis failure must never exit the process — the app is
 * designed to run fully without it.
 */
let client: Redis | null = null;

/** Connect lazily; no-op when disabled. Never exits the process on failure. */
export function connectRedis(): void {
  if (!config.redisEnabled) {
    logger.info("Redis disabled (REDIS_ENABLED!=true)");
    return;
  }

  client = new Redis(config.redisUrl, {
    // Bound the retry-per-command so a dead Redis fails fast and consumers can
    // fall back (fail-open) instead of hanging requests.
    maxRetriesPerRequest: 2,
  });

  client.on("connect", () => logger.info("Redis connected"));
  client.on("error", (err) => logger.error("Redis error", { err }));
}

/** Shared client, or null when Redis is disabled / not connected. */
export function getRedis(): Redis | null {
  return client;
}

/** Graceful close; safe to call even if never connected. */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
