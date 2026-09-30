import { configureApp } from "@/app-setup";
import { AppModule } from "@/app.module";
import { setupSwagger } from "@/common/swagger/setup";
import { AppConfigService } from "@/config/app-config.service";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

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
