import { Public } from "@/common/decorators/public.decorator";
import { isRedisReady } from "@/redis/redis-ready.util";
import { RedisService } from "@/redis/redis.service";
import { Controller, Get } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Connection } from "mongoose";

/**
 * Health controller — ported from express routes/health-check.ts.
 *
 * @Public: no JWT required. HMAC is still applied by SecurityGuard (its HMAC
 * step runs before the JWT step; @Public only skips JWT).
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
@ApiTags("health")
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Check service, MongoDB, and Redis status" })
  @ApiResponse({ status: 200, description: "Service health status" })
  @ApiResponse({ status: 401, description: "Valid HMAC signature headers are required" })
  @ApiResponse({ status: 429, description: "Too many requests" })
  @ApiResponse({ status: 500, description: "The server could not complete the request" })
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
    if (!isRedisReady(client)) return "down";
    try {
      await client.ping();
      return "up";
    } catch {
      return "down";
    }
  }
}
