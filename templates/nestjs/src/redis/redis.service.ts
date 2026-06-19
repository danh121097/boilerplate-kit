import { REDIS_CLIENT } from "@/redis/redis.constants";
import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";

/**
 * Thin wrapper around the shared ioredis client. Exposes getClient() so
 * consumers (CacheService, TokenRevocationService, throttler storage) can
 * retrieve the raw client and wrap ops in try/catch for fail-open behavior.
 * Returns null when Redis is disabled — callers must handle the null case.
 */
@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  /** Raw ioredis instance — null when REDIS_ENABLED=false. */
  getClient(): Redis | null {
    return this.client;
  }
}
