/**
 * Shared helper to bootstrap a full NestJS INestApplication for e2e tests.
 *
 * Applies the same middleware as main.ts bootstrap() but without listen():
 *   - cookieParser (needed for refresh-token cookie dual-mode)
 *   - setGlobalPrefix from API_PREFIX env (must match what SecurityGuard reads
 *     from AppConfigService.apiPrefix so derivePath strips the correct prefix)
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
import { AppConfigService } from "@/config/app-config.service";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  // Mirror main.ts middleware (helmet + compression optional in tests).
  app.use(cookieParser());

  // Must match AppConfigService.apiPrefix so SecurityGuard.derivePath strips
  // the correct prefix ("/api/v1") from req.originalUrl.
  const config = app.get(AppConfigService);
  app.setGlobalPrefix(config.apiPrefix);

  await app.init();
  return app;
}
