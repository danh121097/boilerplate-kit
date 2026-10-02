import { config } from "@/config/environment";
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

/** Minimum gap between log lines for the same connection error (ioredis retries every ~1.4 s). */
export const CONNECTION_ERROR_LOG_INTERVAL_MS = 60_000;
/** Cap on remembered keys; the oldest is evicted so a long outage with changing messages stays bounded. */
export const MAX_LOG_THROTTLE_KEYS = 100;
const lastLoggedAt = new Map<string, number>();

/**
 * Log a Redis connection error as one concise line (message only, no stack), at most
 * once per interval for each distinct label + message, so an outage does not flood the log.
 */
export function logRedisConnectionError(label: string, err: Error): void {
  const key = `${label}:${err.message}`;
  const now = Date.now();
  const last = lastLoggedAt.get(key);
  if (last !== undefined && now - last < CONNECTION_ERROR_LOG_INTERVAL_MS) return;
  // Re-insert so Map order stays oldest-first, then drop the oldest beyond the cap.
  lastLoggedAt.delete(key);
  lastLoggedAt.set(key, now);
  if (lastLoggedAt.size > MAX_LOG_THROTTLE_KEYS) {
    const oldest = lastLoggedAt.keys().next().value;
    if (oldest !== undefined) lastLoggedAt.delete(oldest);
  }
  logger.warn(label, { reason: err.message });
}

/** Connect lazily; no-op when disabled. Never exits the process on failure. */
export function connectRedis(): void {
  if (!config.redisEnabled) {
    logger.info("Redis disabled (REDIS_ENABLED!=true)");
    return;
  }

  client = new Redis(config.redisUrl, {
    // Fail fast so a dead Redis never stalls requests: commands issued while the
    // client is not connected reject immediately (no offline queue), and a command
    // on a live connection gives up after 1s. Consumers fail open on the rejection.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    commandTimeout: 1000,
  });

  client.on("connect", () => logger.info("Redis connected"));
  client.on("error", (err) => logRedisConnectionError("Redis error", err));
}

/** Shared client, or null when Redis is disabled / not connected. */
export function getRedis(): Redis | null {
  return client;
}

/**
 * Graceful close; safe to call even if never connected. QUIT needs a live
 * connection (with the offline queue off it rejects when Redis is down), so a client
 * that is not ready is dropped instead, and a failing QUIT falls back to disconnect.
 */
export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  const closing = client;
  client = null;
  if (closing.status === "ready") await closing.quit().catch(() => closing.disconnect());
  else closing.disconnect();
}
