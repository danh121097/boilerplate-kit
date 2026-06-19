import { AppLogger } from "@/common/logger/app-logger.service";
import { RedisService } from "@/redis/redis.service";
import { Injectable } from "@nestjs/common";

/**
 * Generic cache-aside helpers — ported from express utils/cache.ts.
 *
 * Transparent no-ops when Redis is off so callers never branch on enabled/disabled.
 * Fail-open on Redis errors (return null / swallow) so a cache outage never breaks
 * the request path. Values are JSON-serialized automatically.
 */
@Injectable()
export class CacheService {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  /** Get and JSON-parse a cached value; null when missing, disabled, or on error. */
  async get<T>(key: string): Promise<T | null> {
    const client = this.redis.getClient();
    if (!client) return null;
    try {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cacheGet failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** JSON-serialize and store a value with a TTL in seconds; no-op when disabled. */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;
    try {
      await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      this.logger.warn(`cacheSet failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Delete a cached key; no-op when disabled. */
  async del(key: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;
    try {
      await client.del(key);
    } catch (err) {
      this.logger.warn(`cacheDel failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
