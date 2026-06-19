import { AppLogger } from "@/common/logger/app-logger.service";
import { AppConfigService } from "@/config/app-config.service";
import { REDIS_CLIENT } from "@/redis/redis.constants";
import { RedisService } from "@/redis/redis.service";
import { Global, Module, OnModuleDestroy, Provider } from "@nestjs/common";
import IORedis, { Redis } from "ioredis";

/**
 * Global Redis module — provides a single shared ioredis client under REDIS_CLIENT.
 * When REDIS_ENABLED=false the provider resolves to null; all consumers must treat
 * null as "disabled" and fail-open.
 *
 * Single shutdown owner: this module's onModuleDestroy quits the shared pub client.
 * The socket adapter (Phase 5) owns + quits ONLY its own sub duplicate — never quits here.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService, AppLogger],
      useFactory: async (config: AppConfigService, logger: AppLogger): Promise<Redis | null> => {
        if (!config.redisEnabled) {
          logger.log("Redis disabled — operating without cache/revocation/throttler storage");
          return null;
        }

        const client = new IORedis(config.redisUrl, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
        });

        client.on("error", (err: Error) => {
          logger.warn(`Redis connection error: ${err.message}`);
        });

        try {
          await client.connect();
          logger.log("Redis connected");
        } catch (err) {
          // Fail-open: log the error but never throw — Redis is optional.
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`Redis connect failed (fail-open): ${msg}`);
        }

        return client;
      },
    } satisfies Provider,
    RedisService,
    AppLogger,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(private readonly redisService: RedisService) {}

  onModuleDestroy(): void {
    // Single shutdown owner for the shared pub client.
    const client = this.redisService.getClient();
    if (client) {
      client.quit().catch(() => {
        // Ignore quit errors on shutdown — process is exiting anyway.
      });
    }
  }
}
