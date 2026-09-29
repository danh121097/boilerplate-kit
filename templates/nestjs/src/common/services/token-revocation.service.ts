import { AppLogger } from "@/common/logger/app-logger.service";
import { AppConfigService } from "@/config/app-config.service";
import { RedisService } from "@/redis/redis.service";
import { Injectable } from "@nestjs/common";

/**
 * User-level access-token revocation — ported from express utils/token-revocation.ts.
 *
 * Records a "revoked at" epoch-seconds timestamp per user in Redis. Any access token
 * whose `iat` predates that timestamp is rejected by SecurityGuard.
 * The key auto-expires after one access-token lifetime (accessTtlSeconds), by which
 * point all older tokens have expired anyway.
 *
 * LIMITATION: revocation only holds when Redis is enabled. When Redis is disabled,
 * revokeUserTokens is a no-op and getUserRevokedAt always returns null — meaning
 * logout does not proactively invalidate access tokens on the wire; they expire
 * naturally. This matches express behavior and must be documented for operators.
 *
 * All Redis operations are no-ops or return null on errors (fail-open) so a Redis
 * outage never locks users out.
 */

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
    const now = Math.floor(Date.now() / 1000);
    try {
      await client.set(redisKey(userId), String(now), "EX", this.accessTtlSeconds());
    } catch (err) {
      this.logger.warn(`revokeUserTokens failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Epoch-seconds cutoff before which tokens are revoked, or null if none/disabled.
   * Returns null on Redis errors (fail-open — do not block the request).
   */
  async getUserRevokedAt(userId: string): Promise<number | null> {
    const client = this.redis.getClient();
    if (!client) return null; // Redis disabled — fail-open
    try {
      const value = await client.get(redisKey(userId));
      return value ? parseInt(value, 10) : null;
    } catch (err) {
      this.logger.warn(`getUserRevokedAt failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
