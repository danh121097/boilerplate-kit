import { AppLogger } from "@/common/logger/app-logger.service";
import { AppConfigService } from "@/config/app-config.service";
import { isRedisReady } from "@/redis/redis-ready.util";
import { RedisService } from "@/redis/redis.service";
import { Injectable } from "@nestjs/common";

/**
 * User-level access-token revocation — ported from express utils/token-revocation.ts.
 *
 * Records a "revoked at" epoch-milliseconds cutoff per user in Redis. Any access token
 * issued before that cutoff (`iat_ms`, falling back to `iat * 1000`) is rejected by
 * SecurityGuard and the socket handshake — see isTokenRevoked.
 * The key auto-expires after one access-token lifetime (accessTtlSeconds), by which
 * point all older tokens have expired anyway.
 *
 * LIMITATION: revocation only holds when Redis is enabled. When Redis is disabled,
 * revokeUserTokens is a no-op and getUserRevokedAt always returns null — meaning
 * logout does not proactively invalidate access tokens on the wire; they expire
 * naturally. This matches express behavior and must be documented for operators.
 *
 * All Redis operations are no-ops or return null on errors (fail-open) so a Redis
 * outage never locks users out. They also short-circuit when the client is not
 * "ready", so an outage costs no latency.
 */

/** Values below this are legacy epoch-seconds cutoffs (ms values are ~1.7e12). */
const LEGACY_SECONDS_CEILING = 1e11;

const redisKey = (userId: string): string => `revoked:user:${userId}`;

@Injectable()
export class TokenRevocationService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
    private readonly logger: AppLogger,
  ) {}

  /** Access-token lifetime in seconds, from JWT_ACCESS_EXPIRY. */
  accessTtlSeconds(): number {
    return this.config.jwtAccessTtlSeconds;
  }

  /** Mark all of a user's access tokens issued before now as revoked. */
  async revokeUserTokens(userId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return; // Redis disabled — fail-open (no-op)
    if (!isRedisReady(client)) {
      this.logger.warn("revokeUserTokens skipped: Redis not ready");
      return;
    }
    try {
      await client.set(redisKey(userId), String(Date.now()), "EX", this.accessTtlSeconds());
    } catch (err) {
      this.logger.warn(
        `revokeUserTokens failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Epoch-milliseconds cutoff before which tokens are revoked, or null if
   * none/disabled. Legacy epoch-seconds values are scaled to ms. Returns null on
   * Redis errors or when the client is not ready (fail-open — do not block the request).
   */
  async getUserRevokedAt(userId: string): Promise<number | null> {
    const client = this.redis.getClient();
    if (!client || !isRedisReady(client)) return null; // disabled or outage — fail-open
    try {
      const value = await client.get(redisKey(userId));
      if (!value) return null;
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed)) return null;
      return parsed < LEGACY_SECONDS_CEILING ? parsed * 1000 : parsed;
    } catch (err) {
      this.logger.warn(
        `getUserRevokedAt failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

/**
 * True when an access token was issued before the user's revocation cutoff (ms).
 * Uses `iat_ms`, falling back to `iat * 1000` for tokens without the claim. A token
 * issued after the revoke inside the same second is not revoked.
 */
export function isTokenRevoked(
  payload: { iat?: number; iat_ms?: number },
  cutoffMs: number | null,
): boolean {
  if (cutoffMs === null) return false;
  const issuedMs =
    typeof payload.iat_ms === "number"
      ? payload.iat_ms
      : typeof payload.iat === "number"
        ? payload.iat * 1000
        : undefined;
  return issuedMs !== undefined && issuedMs < cutoffMs;
}
