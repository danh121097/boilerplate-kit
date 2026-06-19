import { config } from "@/config/environment";
import { errorHandler } from "@/middleware/error-handler";
import { verifyHmacRequest } from "@/middleware/hmac";
import { notFoundHandler } from "@/middleware/not-found-handler";
import { globalRateLimiter } from "@/middleware/rate-limit";
import { verifyOrigin } from "@/middleware/verify-origin";
import { logger } from "@/utils/logger";
import express, { type Express } from "express";
import routes from "@/routes";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

const app: Express = express();

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
