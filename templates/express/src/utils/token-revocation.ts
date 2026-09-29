import { getRedis } from "@/config/redis";
import { logger } from "@/utils/logger";
import { isRedisReady } from "@/utils/redis-ready";
import { accessTtlSeconds } from "@/utils/token-lifetimes";

/**
 * User-level access-token revocation. Access tokens are short-lived and cannot be
 * individually unsigned, so logout/ban records a "revoked at" cutoff (epoch
 * milliseconds) per user; any access token issued before it is rejected. The key
 * auto-expires after one access-token lifetime, by which point all older tokens have
 * expired anyway.
 *
 * All operations are no-ops when Redis is disabled and fail open — immediately when
 * the client is not ready, otherwise on errors — so an outage never locks users out
 * or stalls requests.
 */

const key = (userId: string): string => `revoked:user:${userId}`;

/** Cutoffs written before millisecond precision were epoch seconds; scale those up. */
const MS_THRESHOLD = 1e11;

/** Mark all of a user's access tokens issued before now as revoked. */
export async function revokeUserTokens(userId: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  if (!isRedisReady(client)) {
    logger.warn("revokeUserTokens skipped: Redis not ready", { userId });
    return;
  }
  try {
    await client.set(key(userId), String(Date.now()), "EX", accessTtlSeconds());
  } catch (err) {
    logger.warn("revokeUserTokens failed", { err });
  }
}

/** Epoch-milliseconds cutoff before which tokens are revoked, or null if none/disabled/unavailable. */
export async function getUserRevokedAt(userId: string): Promise<number | null> {
  const client = getRedis();
  if (!client || !isRedisReady(client)) return null;
  try {
    const value = await client.get(key(userId));
    if (!value) return null;
    const cutoff = parseInt(value, 10);
    return cutoff < MS_THRESHOLD ? cutoff * 1000 : cutoff;
  } catch (err) {
    logger.warn("getUserRevokedAt failed", { err });
    return null;
  }
}

/**
 * True when an access token was issued before the user's revoke cutoff. Uses the
 * millisecond `iat_ms` claim, falling back to `iat` (seconds) for older tokens, so a
 * token issued in the same second as a logout is not wrongly kept or rejected.
 */
export function isAccessTokenRevoked(
  decoded: { iat?: number; iat_ms?: number },
  cutoffMs: number | null,
): boolean {
  if (cutoffMs === null) return false;
  const issuedMs = decoded.iat_ms ?? (decoded.iat ?? 0) * 1000;
  return issuedMs < cutoffMs;
}
