import { configureApp } from "@/app-setup";
import { AppModule } from "@/app.module";
import { buildHmacBootstrapJs, hmacRequestInterceptor } from "@/common/swagger/hmac-interceptor";
import { AppConfigService } from "@/config/app-config.service";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Express } from "express";

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

  configureApp(app);
  app.enableShutdownHooks();

  // Global ZodValidationPipe + HttpExceptionFilter are registered as APP_PIPE/
  // APP_FILTER in CommonModule; the global SecurityGuard + throttler in their modules.
  setupSwagger(app, config);

  await app.listen(config.port);
}

void bootstrap();
