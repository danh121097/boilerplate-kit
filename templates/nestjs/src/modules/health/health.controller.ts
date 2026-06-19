import { Public } from "@/common/decorators/public.decorator";
import { RedisService } from "@/redis/redis.service";
import { Controller, Get } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";

/**
 * Health controller — ported from express routes/health-check.ts.
 *
 * @Public: no JWT required. HMAC is still applied by SecurityGuard (HmacGuard
 * runs before JwtAuthGuard inside the composite guard; @Public only skips JWT).
 * This matches express behavior where health is under the HMAC-protected apiPrefix.
 *
 * Response shape mirrors express exactly:
 *   { status, timestamp, uptime, database, redis }
 * database: mapped readyState string (disconnected/connecting/connected/disconnecting/unknown)
 * redis:    "disabled" | "up" | "down"
 */

const DB_STATE_MAP = new Map<number, string>([
  [0, "disconnected"],
  [1, "connected"],
  [2, "connecting"],
  [3, "disconnecting"],
]);

@Controller("health")
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get()
  async check(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    database: string;
    redis: string;
  }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: DB_STATE_MAP.get(this.connection.readyState) ?? "unknown",
      redis: await this.getRedisStatus(),
    };
  }

  /** Report Redis liveness: "disabled" when off, "up"/"down" by PING result. */
  private async getRedisStatus(): Promise<string> {
    const client = this.redisService.getClient();
    if (!client) return "disabled";
    try {
      await client.ping();
      return "up";
    } catch {
      return "down";
    }
  }
}
