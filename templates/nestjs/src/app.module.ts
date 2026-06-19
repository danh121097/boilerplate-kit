import { CommonModule } from "@/common/common.module";
import { SecurityGuard } from "@/common/guards/security.guard";
import { ThrottlerConfigModule } from "@/common/throttler/throttler.module";
import { AppConfigModule } from "@/config/config.module";
import { DatabaseModule } from "@/database/database.module";
import { HealthModule } from "@/health/health.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { UserModule } from "@/modules/user/user.module";
import { RealtimeModule } from "@/realtime/realtime.module";
import { RedisModule } from "@/redis/redis.module";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

/**
 * Root application module.
 *
 * Two APP_GUARDs are registered — independent concerns, separate providers:
 *   1. SecurityGuard  — composite HMAC → origin/CSRF → JWT → roles (ordered internally).
 *   2. AppThrottlerGuard — rate limiting (registered via ThrottlerConfigModule).
 *
 * Internal ordering within SecurityGuard is deterministic and not affected by
 * APP_GUARD array position. Throttler is order-independent (it only counts).
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    CommonModule,
    HealthModule,
    AuthModule,
    UserModule,
    RealtimeModule,
    // Registers ThrottlerModule + AppThrottlerGuard as APP_GUARD.
    ThrottlerConfigModule,
  ],
  providers: [
    // Composite security guard: HMAC → origin/CSRF → JWT → roles.
    {
      provide: APP_GUARD,
      useClass: SecurityGuard,
    },
  ],
})
export class AppModule {}
