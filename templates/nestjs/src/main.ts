import { AppModule } from "@/app.module";
import { buildHmacBootstrapJs, hmacRequestInterceptor } from "@/common/swagger-hmac-interceptor";
import { AppConfigService } from "@/config/app-config.service";
import { RedisIoAdapter } from "@/realtime/redis-io.adapter";
import { RedisService } from "@/redis/redis.service";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Express } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";

/**
 * Mount Swagger UI at /docs (OpenAPI JSON at /docs-json). `cleanupOpenApiDoc`
 * (nestjs-zod v5) rewrites the document so `createZodDto` schemas render with
 * full field definitions.
 *
 * API routes are HMAC-guarded. In NON-production we auto-sign every "Try it out"
 * request (requestInterceptor + injected secret) so the docs are fully testable.
 * In production this auto-signing is disabled and the secret is never embedded.
 */
function setupSwagger(app: NestExpressApplication, config: AppConfigService): void {
  const builder = new DocumentBuilder()
    .setTitle(config.appName || "NestJS Starter API")
    .setDescription(
      "JWT (RS256 access + refresh rotation), HMAC-signed requests, RBAC, Socket.IO. " +
        "All API routes require `sig` + `ctime` HMAC headers; protected routes also require a Bearer access token." +
        (config.isProduction
          ? ""
          : " Dev mode: requests are auto-signed with HMAC, so Try it out works directly."),
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, builder);

  const devAutoSign = !config.isProduction;
  if (devAutoSign) {
    // Serve the HMAC config as a SAME-ORIGIN external script (not inline): helmet's
    // CSP `script-src 'self'` blocks inline scripts but allows 'self' files, so the
    // interceptor in swagger-ui-init.js can read window.__HMAC_CFG__ from here.
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    expressApp.get("/swagger-hmac-config.js", (_req, res): void => {
      res
        .type("application/javascript")
        .send(buildHmacBootstrapJs(config.hmacSecret, config.apiPrefix));
    });
  }

  SwaggerModule.setup("docs", app, cleanupOpenApiDoc(document), {
    customJs: devAutoSign ? "/swagger-hmac-config.js" : undefined,
    swaggerOptions: {
      persistAuthorization: true,
      ...(devAutoSign ? { requestInterceptor: hmacRequestInterceptor } : {}),
    },
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(AppConfigService);

  // Security + perf middleware (runs before routing).
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.setGlobalPrefix(config.apiPrefix);
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.enableShutdownHooks();

  // Global ZodValidationPipe + HttpExceptionFilter are registered as APP_PIPE/
  // APP_FILTER in CommonModule; the global SecurityGuard + throttler in their modules.
  setupSwagger(app, config);

  // --- WebSocket adapter (must be before app.listen()) ----------------------
  // When Redis is enabled, use RedisIoAdapter for multi-instance pub/sub
  // fan-out. The shared Redis client (owned by RedisModule) is passed as the
  // pub connection; the adapter creates its own sub duplicate internally.
  // When Redis is disabled, the default IoAdapter handles single-instance WS.
  // CRITICAL: useWebSocketAdapter must be called before listen() — calling it
  // after listen() silently no-ops and the adapter is never applied.
  // --------------------------------------------------------------------------
  if (config.redisEnabled) {
    const redisClient = app.get(RedisService).getClient();
    if (redisClient) {
      app.useWebSocketAdapter(new RedisIoAdapter(app, redisClient));
    }
  }

  await app.listen(config.port);
}

void bootstrap();
