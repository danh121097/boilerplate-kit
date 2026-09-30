import { config } from "@/config/environment";
import { buildHmacBootstrapJs, hmacRequestInterceptor } from "@/docs/hmac-interceptor";
import { createOpenApiDocument } from "@/docs/openapi";
import { errorHandler } from "@/middleware/error-handler";
import { verifyHmacRequest } from "@/middleware/hmac";
import { notFoundHandler } from "@/middleware/not-found-handler";
import { globalRateLimiter } from "@/middleware/rate-limit";
import { verifyOrigin } from "@/middleware/verify-origin";
import routes, { groups } from "@/routes";
import { logger } from "@/utils/logger";
import express, { type Express } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

const app: Express = express();
const openApiDocument = createOpenApiDocument(groups);

// Only trust X-Forwarded-* when TRUST_PROXY is set (reverse proxy / load balancer).
if (config.trustProxy !== undefined) app.set("trust proxy", config.trustProxy);

// Security headers
app.use(helmet());

// HTTP request logging routed through the app logger (one consistent output).
if (!config.isTest) {
  app.use(
    morgan(config.isProduction ? "combined" : "dev", {
      stream: { write: (message) => logger.info(message.trim()) },
    }),
  );
}

// Response compression
app.use(compression());

// CORS with credentials support for cookie-based auth. Allow-list = config.corsOrigins
// (hard-coded list, shared with the CSRF guard); `cors` reflects whichever allow-listed
// origin made the request into Access-Control-Allow-Origin.
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Keep interactive API documentation outside the API HMAC and rate-limit mounts.
app.get("/docs/json", (_req, res) => res.json(openApiDocument));
if (config.isDevelopment) {
  app.get("/docs/hmac-config.js", (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(buildHmacBootstrapJs(config.hmacSecret, config.apiPrefix));
  });
}
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    ...(config.isDevelopment
      ? {
          customJs: "/docs/hmac-config.js",
          swaggerOptions: { requestInterceptor: hmacRequestInterceptor },
        }
      : {}),
  }),
);

// HMAC signature verification for all API routes
app.use(config.apiPrefix, verifyHmacRequest);

// CSRF Origin allow-list on mutating methods (no-op unless ENABLE_CSRF=true).
app.use(config.apiPrefix, verifyOrigin);

// Default rate limit for all API routes (100/min). Auth/login routes layer their
// own stricter limiters on top via their route definitions.
app.use(config.apiPrefix, globalRateLimiter);

// Routes
app.use(config.apiPrefix, routes);

// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
