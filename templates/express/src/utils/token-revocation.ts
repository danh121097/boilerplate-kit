import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";
import { logger } from "@/utils/logger";

/**
 * User-level access-token revocation. Access tokens are short-lived and cannot be
 * individually unsigned, so logout/ban records a "revoked at" timestamp per user;
 * any access token whose `iat` predates it is rejected. The key auto-expires after
 * one access-token lifetime, by which point all older tokens have expired anyway.
 *
 * All operations are no-ops when Redis is disabled and fail open on Redis errors
 * so an outage never locks users out.
 */

const key = (userId: string): string => `revoked:user:${userId}`;

/** Parse a jwt-style expiry ('15m', '900s', '1h', '7d', or seconds) to seconds. */
export function accessTtlSeconds(): number {
  const raw = config.jwtAccessExpiry?.trim();
  if (!raw) return 900;
  const num = Number(raw);
  if (!Number.isNaN(num)) return num;
  const match = /^(\d+)\s*([smhd])$/.exec(raw);
  if (!match) return 900;
  const value = parseInt(match[1], 10);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 1;
  return value * unit;
}

/** Mark all of a user's access tokens issued before now as revoked. */
export async function revokeUserTokens(userId: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    await client.set(key(userId), String(now), "EX", accessTtlSeconds());
  } catch (err) {
    logger.warn("revokeUserTokens failed", { err });
  }
}

/** Epoch-seconds cutoff before which tokens are revoked, or null if none/disabled. */
export async function getUserRevokedAt(userId: string): Promise<number | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const value = await client.get(key(userId));
    return value ? parseInt(value, 10) : null;
  } catch (err) {
    logger.warn("getUserRevokedAt failed", { err });
    return null;
  }
}
