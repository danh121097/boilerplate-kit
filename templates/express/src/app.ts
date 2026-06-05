import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config/environment";
import { errorHandler } from "./middleware/error-handler";
import { verifyHmacRequest } from "./middleware/hmac";
import { notFoundHandler } from "./middleware/not-found-handler";
import { globalRateLimiter } from "./middleware/rate-limit";
import routes from "./routes";

const app: Express = express();

// Security headers
app.use(helmet());

// Request logging (skip in test)
if (!config.isTest) {
  app.use(morgan(config.isProduction ? "combined" : "dev"));
}

// Response compression
app.use(compression());

// CORS with credentials support for cookie-based auth
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// HMAC signature verification for all API routes
app.use(config.apiPrefix, verifyHmacRequest);

// Default rate limit for all API routes (100/min). Auth/login routes layer their
// own stricter limiters on top via their route definitions.
app.use(config.apiPrefix, globalRateLimiter);

// Routes
app.use(config.apiPrefix, routes);

// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
