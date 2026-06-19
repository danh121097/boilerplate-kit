import { AppException } from "@/common/exceptions/app.exception";
import { AppConfigService } from "@/config/app-config.service";
import { RedisService } from "@/redis/redis.service";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { ExecutionContext, Injectable, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerRequest,
} from "@nestjs/throttler";

/**
 * Custom throttler guard that:
 *   1. Skips entirely when config.isTest (mirrors express `skip: () => isTest`).
 *   2. Catches storage/Redis errors and allows the request (fail-open), matching
 *      express `passOnStoreError: true` on all three rate limiters.
 *   3. Throws AppException(RATE_LIMIT) so the HttpExceptionFilter renders the
 *      exact express error envelope instead of NestJS's default ThrottlerException.
 *
 * Registered as APP_GUARD so it applies globally to all routes. Throttle limits
 * are configured per-throttler-name on the ThrottlerModule (see below).
 *
 * Controller-level layering (used in Phase 4):
 *   Auth routes need BOTH the global 100/min cap AND the per-route auth/login cap.
 *   @Throttle({ default: { limit: 100, ttl: 60000 }, login: { limit: 30, ttl: 900000 } })
 *   Listing the 'default' tier explicitly keeps both counters running — omitting it
 *   would override (not extend) the global cap.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /** Skip throttling entirely in test environment (matches express skip: () => isTest). */
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Resolve AppConfigService from the guard's injected options context.
    // ThrottlerGuard does not inject arbitrary services, so we access the
    // stored options factory result. We piggyback on the existing shouldSkip
    // chain by reading NODE_ENV directly — safe because this guard is only
    // constructed after the DI container is ready.
    const isTest = process.env["NODE_ENV"] === "test";
    if (isTest) return true;
    return super.shouldSkip(context);
  }

  /**
   * Fail-open: if the storage backend (Redis) throws during the rate-limit
   * increment, catch and return true (allow the request through).
   * Mirrors express `passOnStoreError: true` on all three limiters.
   */
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch {
      // Storage error (e.g. Redis outage) — allow request, do not block.
      return true;
    }
  }

  /**
   * Override throwThrottlingException to emit an AppException with errorType
   * RATE_LIMIT so HttpExceptionFilter renders the standard express error envelope.
   */
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: Parameters<ThrottlerGuard["throwThrottlingException"]>[1],
  ): Promise<void> {
    throw new AppException({
      message: "Too many requests, please try again later!",
      statusCode: 429,
      errorType: "RATE_LIMIT",
    });
  }
}

/**
 * ThrottlerConfigModule — configures @nestjs/throttler v6 with:
 *   - Redis-backed storage reusing the Phase-2 ioredis client (no new connection).
 *   - Named throttlers matching express rate-limit.ts exactly:
 *       default  → 100 req / 60 s   (global API cap)
 *       auth     → 30 req / 900 s   (auth endpoints)
 *       login    → 30 req / 900 s   (login endpoint, stricter brute-force guard)
 *   - Registers AppThrottlerGuard as APP_GUARD.
 *
 * When Redis is disabled (getClient() === null), storage falls back to the
 * in-memory default — no additional configuration needed.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService, RedisService],
      useFactory: (config: AppConfigService, redisService: RedisService) => {
        const client = redisService.getClient();

        // Build Redis storage only when the client is available; otherwise
        // ThrottlerModule uses its built-in in-memory MemoryStore.
        const storage = client
          ? new ThrottlerStorageRedisService(client)
          : undefined;

        return {
          ...(storage ? { storage } : {}),
          throttlers: [
            // Global cap — mirrors globalRateLimiter (100 req/min).
            { name: "default", ttl: 60_000, limit: 100 },
            // Auth cap — mirrors authRateLimiter (30 req/15 min).
            { name: "auth", ttl: 900_000, limit: 30 },
            // Login cap — mirrors loginRateLimiter (30 req/15 min).
            { name: "login", ttl: 900_000, limit: 30 },
          ],
        };
      },
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class ThrottlerConfigModule {}
