/**
 * Shared helper to bootstrap a full NestJS application for e2e tests.
 *
 * Applies the same setup as main.ts through `configureApp` (helmet, compression,
 * cookie parser, global prefix, CORS, trust proxy, socket adapter) but without
 * Swagger or shutdown hooks.
 *
 * The HTTP server is bound once to an ephemeral port on 127.0.0.1 and supertest
 * reuses it. Left unbound, supertest would `listen(0)` on the wildcard address for
 * every request and then connect to 127.0.0.1:<port>; on macOS a wildcard bind may
 * be handed a port that another process already listens on at 127.0.0.1 (editor
 * helpers, dev servers, other test runs), and that process would answer instead of
 * this app. An explicit loopback bind conflicts with such a listener, so the OS
 * picks another port.
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

/** Loopback address the test server binds to; use it for direct client connections. */
export const TEST_HOST = "127.0.0.1";

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);

  await app.listen(0, TEST_HOST);
  return app;
}
