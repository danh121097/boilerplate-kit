import { getRedis } from "@/config/redis";
import { logger } from "@/utils/logger";

/**
 * Generic cache-aside helpers. They are transparent no-ops when Redis is off so
 * callers never branch on enabled/disabled, and they fail open (return null /
 * swallow) on Redis errors so a cache outage never breaks the request path.
 * Values are JSON-serialized automatically.
 */

/** Get and JSON-parse a cached value; null when missing, disabled, or on error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn("cacheGet failed", { err });
    return null;
  }
}

/** JSON-serialize and store a value with a TTL (seconds); no-op when disabled. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn("cacheSet failed", { err });
  }
}

/** Delete a cached key; no-op when disabled. */
export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    logger.warn("cacheDel failed", { err });
  }
}
