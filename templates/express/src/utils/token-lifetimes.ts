import { parseDurationSeconds } from "@/config/duration";
import { config } from "@/config/environment";

/** Access-token lifetime in seconds, from `JWT_ACCESS_EXPIRY` (validated at boot). */
export function accessTtlSeconds(): number {
  return parseDurationSeconds(config.jwtAccessExpiry, "JWT_ACCESS_EXPIRY");
}

/** Refresh-token lifetime in seconds, from `JWT_REFRESH_EXPIRY` (validated at boot). */
export function refreshTtlSeconds(): number {
  return parseDurationSeconds(config.jwtRefreshExpiry, "JWT_REFRESH_EXPIRY");
}
