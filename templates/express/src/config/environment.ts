import { loadRsaKeyPair } from "./keys";
import { EnvironmentConfig } from "@/types";
import dotenv from "dotenv";

dotenv.config();

const { privateKey: jwtAccessPrivateKey, publicKey: jwtAccessPublicKey } = loadRsaKeyPair();

/** Retrieve required env var or throw */
function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const isDevelopment = nodeEnv === "development";
const isTest = nodeEnv === "test";

/**
 * Allowed browser origins for CORS + the CSRF guard. Hard-coded here (not env) so
 * the list is easy to edit in one place — add your production frontend origin(s)
 * below before deploying. Keep localhost out of the production list.
 */
const corsOrigins: string[] = isProduction
  ? [
      "https://app.example.com", // ← replace with your production frontend origin(s)
    ]
  : ["http://localhost:5173", "http://localhost:9000"];

/** Validated environment configuration */
export const config: EnvironmentConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  isProduction,
  isDevelopment,
  isTest,
  nodeEnv,
  mongodbUri: getRequiredEnvVar("MONGODB_URI"),
  hmacSecret: getRequiredEnvVar("HMAC_SECRET"),
  jwtRefreshSecret: getRequiredEnvVar("JWT_REFRESH_SECRET"),
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  jwtAccessPrivateKey,
  jwtAccessPublicKey,
  corsOrigins,
  // Off by default — same-origin proxy deploy closes CSRF via SameSite; opt in for defense-in-depth.
  enableCsrf: process.env.ENABLE_CSRF === "true",
  // Unset = host-only cookie; set for split-domain deploys (e.g. ".example.com").
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  // Redis is optional: not read via getRequiredEnvVar so the app boots fine when off.
  redisEnabled: process.env.REDIS_ENABLED === "true",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};
