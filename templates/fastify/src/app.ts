import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";
import { hmacRequestInterceptor } from "@/docs/hmac-interceptor";
import { installErrorHandlers } from "@/plugins/error-handlers";
import { installSecurityHooks } from "@/plugins/security";
import { registerApi } from "@/routes";
import { closeSocket, initSocket } from "@/socket";
import Fastify, { type FastifyInstance, type RawServerDefault } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

export interface BuildAppOptions {
  /** Disable Socket.IO in focused HTTP tests. Enabled by default. */
  sockets?: boolean;
}

export function buildApp(
  options: BuildAppOptions = {},
): FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse> {
  const app = Fastify<RawServerDefault, IncomingMessage, ServerResponse>({
    bodyLimit: 100 * 1024,
    logController: new Fastify.LogController({ disableRequestLogging: true }),
    logger: config.isTest
      ? false
      : {
          level: config.logLevel,
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.headers.sig",
              "req.headers.ctime",
              "req.body.password",
              "req.body.refreshToken",
              'res.headers["set-cookie"]',
            ],
            censor: "[REDACTED]",
          },
        },
    trustProxy: config.trustProxy,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(cookie);
  app.register(cors, { origin: config.corsOrigins, credentials: true });
  app.register(helmet);
  app.register(compress);
  app.register(swagger, {
    openapi: {
      info: {
        title: "Fastify Starter API",
        description:
          "All API requests require HMAC signatures. In development, Swagger Try it out signs requests automatically; protected routes still require a Bearer token.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  // Off in production unless DOCS_ENABLED=true.
  if (config.docsEnabled) {
    if (config.isDevelopment) {
      app.get("/docs/hmac-config", async (_request, reply) => {
        return reply
          .header("cache-control", "no-store")
          .send({ secret: config.hmacSecret, apiPrefix: config.apiPrefix });
      });
    }

    app.register(swaggerUi, {
      routePrefix: "/docs",
      staticCSP: true,
      uiConfig: {
        deepLinking: false,
        docExpansion: "list",
        ...(config.isDevelopment ? { requestInterceptor: hmacRequestInterceptor } : {}),
      },
    });
  }

  installErrorHandlers(app);
  installSecurityHooks(app);

  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: 60_000,
    skipOnError: true,
    allowList: (request) =>
      config.isTest ||
      !(request.url === config.apiPrefix || request.url.startsWith(`${config.apiPrefix}/`)),
    redis: getRedis() ?? undefined,
  });
  registerApi(app);

  if (options.sockets !== false) {
    initSocket(app.server);
    app.addHook("onClose", async () => closeSocket());
  }

  return app;
}
