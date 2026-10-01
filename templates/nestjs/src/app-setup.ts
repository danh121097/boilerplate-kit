import { mapBodyParserError } from "@/common/filters/map-body-parser-error";
import { AppConfigService } from "@/config/app-config.service";
import { SocketIoAdapter } from "@/modules/realtime/socket-io.adapter";
import { RedisService } from "@/redis/redis.service";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";

/**
 * Apply the HTTP/socket setup shared by main.ts and the e2e test app, so the tests
 * exercise the same middleware chain as production. Must run before `listen()`
 * (the socket adapter is ignored once the app is listening). Swagger, shutdown
 * hooks and `listen` stay in main.ts.
 *
 * Body limits: Nest's default JSON/urlencoded parsers cap bodies at 100kb; larger
 * payloads are answered 413 by HttpExceptionFilter.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  // Only trust X-Forwarded-* when TRUST_PROXY is set (behind a reverse proxy).
  if (config.trustProxy !== undefined) {
    app.set("trust proxy", config.trustProxy);
  }

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  // Before the body parser, so 400/413 parse errors still carry CORS headers.
  app.enableCors({ origin: config.corsOrigins, credentials: true });

  // Register the JSON parser here (Nest skips its own once a `jsonParser` layer exists)
  // so a parse error can be mapped right after it: Nest rewrites any SyntaxError into
  // BadRequestException(err.message), which drops the body-parser `type` and echoes
  // the raw parser text to the client.
  app.useBodyParser("json");
  app.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    next(mapBodyParserError(err) ?? err);
  });

  app.setGlobalPrefix(config.apiPrefix);

  // Socket.IO adapter with shared CORS options; Redis pub/sub only when enabled.
  const redisClient = config.redisEnabled ? app.get(RedisService).getClient() : null;
  app.useWebSocketAdapter(new SocketIoAdapter(app, redisClient));
}
