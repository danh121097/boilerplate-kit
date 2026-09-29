/**
 * Shared helper to bootstrap a full NestJS application for e2e tests.
 *
 * Applies the same setup as main.ts through `configureApp` (helmet, compression,
 * cookie parser, global prefix, CORS, trust proxy, socket adapter) but without
 * Swagger, shutdown hooks or listen().
 *
 * APP_FILTER (HttpExceptionFilter), APP_PIPE (ZodValidationPipe), and
 * APP_GUARD (SecurityGuard + ThrottlerGuard) are all registered inside
 * CommonModule / ThrottlerConfigModule — NestJS applies them automatically.
 *
 * Usage:
 *   let app: INestApplication;
 *   let req: ReturnType<typeof supertest>;
 *
 *   beforeAll(async () => {
 *     app = await createTestApp();
 *     req = supertest(app.getHttpServer());
 *   });
 *   afterAll(() => app.close());
 */
import { AppModule } from "@/app.module";
import { configureApp } from "@/app-setup";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);

  await app.init();
  return app;
}
