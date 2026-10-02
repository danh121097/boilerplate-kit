import { CommonModule } from "@/common/common.module";
import { SecurityGuard } from "@/common/guards/security.guard";
import { AppThrottlerGuard, ThrottlerConfigModule } from "@/common/throttler/throttler.module";
import { AppConfigModule } from "@/config/config.module";
import { DatabaseModule } from "@/database/database.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { HealthModule } from "@/modules/health/health.module";
import { NotFoundModule } from "@/modules/not-found/not-found.module";
import { RealtimeModule } from "@/modules/realtime/realtime.module";
import { UserModule } from "@/modules/user/user.module";
import { RedisModule } from "@/redis/redis.module";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

/**
 * Root application module.
 *
 * Two APP_GUARDs are registered — independent concerns, separate providers, in this
 * order (global guards run in registration order, so keep them together here):
 *   1. AppThrottlerGuard — rate limiting. Runs first so requests SecurityGuard
 *      rejects (HMAC, CSRF, bad JWT, role) still count against the caps, like
 *      express/fastify where the limiter sits ahead of authentication.
 *   2. SecurityGuard  — composite HMAC → origin/CSRF → JWT → roles (ordered internally).
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
    // Configures + exports ThrottlerModule (AppThrottlerGuard is registered below).
    ThrottlerConfigModule,
    // Catch-all 404 behind HMAC. MUST stay the LAST entry: its `{*path}` route matches
    // everything, so any module imported after it gets all its routes answered 404.
    // A unit test pins this; add new feature modules ABOVE this line.
    NotFoundModule,
  ],
  providers: [
    // Rate limiter — MUST precede SecurityGuard (see the class comment).
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    // Composite security guard: HMAC → origin/CSRF → JWT → roles.
    {
      provide: APP_GUARD,
      useClass: SecurityGuard,
    },
  ],
})
export class AppModule {}
