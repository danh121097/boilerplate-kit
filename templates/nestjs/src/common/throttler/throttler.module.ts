import { AppException } from "@/common/exceptions/app.exception";
import { AppLogger } from "@/common/logger/app-logger.service";
import { AppConfigService } from "@/config/app-config.service";
import { isRedisReady } from "@/redis/redis-ready.util";
import { RedisService } from "@/redis/redis.service";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { ExecutionContext, HttpException, Injectable, Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule, ThrottlerRequest } from "@nestjs/throttler";
import { createHash } from "crypto";
import type { Redis } from "ioredis";

/** Minimum gap between "rate-limit store unavailable" warnings. */
export const STORE_FAILURE_WARN_INTERVAL_MS = 60_000;

/**
 * Custom throttler guard that:
 *   1. Skips entirely when config.isTest (mirrors express `skip: () => isTest`).
 *   2. Catches storage/Redis errors and allows the request (fail-open), matching
 *      express `passOnStoreError: true` on all three rate limiters. The 429 thrown
 *      by throwThrottlingException is an HttpException and is always rethrown.
 *   3. Throws AppException(RATE_LIMIT) so the HttpExceptionFilter renders the
 *      exact express error envelope instead of NestJS's default ThrottlerException.
 *
 * Registered as APP_GUARD so it applies globally to all routes. Throttle limits
 * are configured per-throttler-name on the ThrottlerModule (see below).
 *
 * Controller-level layering (used on the auth routes):
 *   Auth routes need BOTH the global 100/min cap AND the per-route auth/login cap.
 *   @Throttle({ default: { limit: 100, ttl: 60000 }, login: { limit: 30, ttl: 900000 } })
 *   Listing the 'default' tier explicitly keeps both counters running — omitting it
 *   would override (not extend) the global cap.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new AppLogger();
  private lastStoreWarnAt = 0;

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
   * Counter key per throttler name + hashed client, ignoring controller and handler.
   * The client (IP) is SHA-256 hashed so the raw address never lands in Redis.
   * The library default also hashes class and handler names, which gives every
   * route its own counters; express shares one `auth` bucket across
   * register/refresh/logout and one global `default` bucket per client.
   */
  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ): string {
    return `${throttlerName}:${createHash("sha256").update(tracker).digest("hex")}`;
  }

  /**
   * Fail-open: if the storage backend (Redis) throws during the rate-limit
   * increment, catch and return true (allow the request through).
   * Mirrors express `passOnStoreError: true` on all three limiters.
   * super.handleRequest also *throws* the 429 when a limit is exceeded — that is
   * an HttpException and must propagate, otherwise nothing is ever blocked.
   */
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Storage error (e.g. Redis outage) — allow request, do not block.
      this.warnStoreFailure(error);
      return true;
    }
  }

  /** One concise warning per interval: during an outage every request fails the store. */
  private warnStoreFailure(error: unknown): void {
    const now = Date.now();
    if (now - this.lastStoreWarnAt < STORE_FAILURE_WARN_INTERVAL_MS) return;
    this.lastStoreWarnAt = now;
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Rate-limit store unavailable, failing open: ${reason}`);
  }

  /**
   * Override throwThrottlingException to emit an AppException with errorType
   * RATE_LIMIT so HttpExceptionFilter renders the standard express error envelope.
   */
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: Parameters<ThrottlerGuard["throwThrottlingException"]>[1],
  ): Promise<void> {
    // generateKey puts the throttler name first, so the key says which cap tripped.
    const isLogin = throttlerLimitDetail.key.startsWith("login:");
    throw new AppException({
      message: isLogin
        ? "Too many login attempts, please try again later!"
        : "Too many requests, please try again later!",
      statusCode: 429,
      errorType: "RATE_LIMIT",
    });
  }
}

/**
 * Redis throttler storage that refuses immediately when the client is not "ready",
 * so the guard (which fails open on storage errors) does not wait on a dead
 * connection during an outage.
 */
export class ReadyGuardedThrottlerStorage extends ThrottlerStorageRedisService {
  constructor(private readonly client: Redis) {
    super(client);
  }

  override async increment(
    ...args: Parameters<ThrottlerStorageRedisService["increment"]>
  ): ReturnType<ThrottlerStorageRedisService["increment"]> {
    if (!isRedisReady(this.client)) throw new Error("Redis not ready");
    return super.increment(...args);
  }
}

// Metadata key @Throttle() writes per throttler name (THROTTLER_LIMIT + name in
// @nestjs/throttler). Not re-exported by the package, so it is mirrored here.
const THROTTLER_LIMIT_METADATA = "THROTTLER:LIMIT";
const reflector = new Reflector();

/**
 * skipIf for opt-in named throttlers. @nestjs/throttler v6 runs EVERY named
 * throttler on EVERY route, so without this the 30/15min auth/login caps would
 * apply app-wide. A route opts in by naming the throttler in @Throttle({...}),
 * matching express, which mounts authRateLimiter/loginRateLimiter on auth routes only.
 */
export function skipUnlessOptedIn(name: string): (context: ExecutionContext) => boolean {
  return (context) =>
    reflector.getAllAndOverride<number | undefined>(THROTTLER_LIMIT_METADATA + name, [
      context.getHandler(),
      context.getClass(),
    ]) === undefined;
}

/**
 * ThrottlerConfigModule — configures @nestjs/throttler v6 with:
 *   - Redis-backed storage reusing the shared ioredis client (no new connection).
 *   - Named throttlers matching express rate-limit.ts exactly:
 *       default  → 100 req / 60 s   (global API cap)
 *       auth     → 30 req / 900 s   (auth endpoints; opt-in via @Throttle)
 *       login    → 30 req / 900 s   (login endpoint; opt-in via @Throttle)
 *   - AppThrottlerGuard is registered as APP_GUARD by AppModule (ahead of SecurityGuard).
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
        const storage = client ? new ReadyGuardedThrottlerStorage(client) : undefined;

        return {
          ...(storage ? { storage } : {}),
          throttlers: [
            // Global cap — mirrors globalRateLimiter (100 req/min).
            { name: "default", ttl: 60_000, limit: 100 },
            // Auth cap — mirrors authRateLimiter (30 req/15 min); opt-in routes only.
            { name: "auth", ttl: 900_000, limit: 30, skipIf: skipUnlessOptedIn("auth") },
            // Login cap — mirrors loginRateLimiter (30 req/15 min); opt-in routes only.
            { name: "login", ttl: 900_000, limit: 30, skipIf: skipUnlessOptedIn("login") },
          ],
        };
      },
    }),
  ],
  // Re-export so AppModule can register AppThrottlerGuard as an APP_GUARD itself:
  // global guards run in registration order, and the throttler must come first.
  exports: [ThrottlerModule],
})
export class ThrottlerConfigModule {}
