import { getRedis } from "@/config/redis";

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
    console.warn("cacheGet failed:", (err as Error).message);
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
    console.warn("cacheSet failed:", (err as Error).message);
  }
}

/** Delete a cached key; no-op when disabled. */
export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    console.warn("cacheDel failed:", (err as Error).message);
  }
}
