import { buildHmacBootstrapJs, hmacRequestInterceptor } from "@/common/swagger/hmac-interceptor";
import { AppConfigService } from "@/config/app-config.service";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Express } from "express";

/**
 * Mount Swagger UI at /docs (OpenAPI JSON at /docs/json). `cleanupOpenApiDoc`
 * (nestjs-zod v5) rewrites the document so `createZodDto` schemas render with
 * full field definitions.
 *
 * API routes are HMAC-guarded. In development we auto-sign every "Try it out"
 * request so users only need a Bearer token for protected routes. Other
 * environments never receive the HMAC secret. Disabled in production unless
 * DOCS_ENABLED=true.
 */
export function setupSwagger(app: NestExpressApplication, config: AppConfigService): void {
  if (!config.docsEnabled) return;

  const builder = new DocumentBuilder()
    .setTitle(config.appName || "NestJS Starter API")
    .setDescription(
      "All API routes require HMAC signatures. In development, Swagger Try it out signs requests automatically; protected routes still require a Bearer token.",
    )
    .setVersion("1.0.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearerAuth")
    .build();
  const document = SwaggerModule.createDocument(app, builder);

  const devAutoSign = config.isDevelopment;
  if (devAutoSign) {
    // Serve the HMAC config as a SAME-ORIGIN external script (not inline): helmet's
    // CSP `script-src 'self'` blocks inline scripts but allows 'self' files, so the
    // interceptor in swagger-ui-init.js can read window.__HMAC_CFG__ from here.
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    expressApp.get("/swagger-hmac-config.js", (_req, res): void => {
      res
        .set("Cache-Control", "no-store")
        .type("application/javascript")
        .send(buildHmacBootstrapJs(config.hmacSecret, config.apiPrefix));
    });
  }

  SwaggerModule.setup("docs", app, cleanupOpenApiDoc(document), {
    customJs: devAutoSign ? "/swagger-hmac-config.js" : undefined,
    jsonDocumentUrl: "docs/json",
    swaggerOptions: {
      persistAuthorization: true,
      ...(devAutoSign ? { requestInterceptor: hmacRequestInterceptor } : {}),
    },
  });
}
