import { CacheService } from "@/common/cache.service";
import { AppException } from "@/common/exceptions/app.exception";
import { HttpExceptionFilter } from "@/common/filters/http-exception.filter";
import { HmacService } from "@/common/hmac.service";
import { AppLogger } from "@/common/logger/app-logger.service";
import { LoggerMiddleware } from "@/common/middleware/logger.middleware";
import { PasswordService } from "@/common/password.service";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { TokenRevocationService } from "@/common/token-revocation.service";
import { TokenService } from "@/common/token.service";
import { RefreshToken, RefreshTokenSchema } from "@/schemas/refresh-token.schema";
import { User, UserSchema } from "@/schemas/user.schema";
import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";

/**
 * Global common module — provides and exports all cross-cutting services.
 * @Global ensures auth/user/realtime modules can inject them without importing CommonModule.
 *
 * Registered globally:
 *   - HttpExceptionFilter via APP_FILTER (renders exact express error envelopes)
 *   - ZodValidationPipe via APP_PIPE (validates all nestjs-zod DTOs)
 *
 * LoggerMiddleware is applied to all routes via NestModule.configure().
 * Mongoose schemas for User and RefreshToken are registered here so feature
 * modules (auth, user) receive them via injection without re-registering.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  providers: [
    AppLogger,
    TokenService,
    PasswordService,
    TokenRevocationService,
    CacheService,
    HmacService,
    // Global exception filter — must be APP_FILTER to have DI (AppLogger injected).
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global validation pipe for nestjs-zod DTOs.
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
  exports: [
    MongooseModule,
    AppLogger,
    TokenService,
    PasswordService,
    TokenRevocationService,
    CacheService,
    HmacService,
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // HTTP access logging — skipped in test (LoggerMiddleware checks NODE_ENV internally).
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}

// Re-export AppException so feature modules have a single import point.
export { AppException };
