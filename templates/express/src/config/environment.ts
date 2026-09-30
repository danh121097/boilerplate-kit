import { parseDurationSeconds } from "@/config/duration";
import { parseEnvironmentFlags } from "@/config/env-validation";
import { loadRsaKeyPair } from "@/config/keys";
import { parseTrustProxy } from "@/config/trust-proxy";
import { EnvironmentConfig } from "@/types";
import dotenv from "dotenv";

dotenv.config();

// Validate flags first so a typo like NODE_ENV=prod fails with a clear message.
const flags = parseEnvironmentFlags();

const { privateKey: jwtAccessPrivateKey, publicKey: jwtAccessPublicKey } = loadRsaKeyPair();

/** Read a duration env var, failing boot on anything but `<positive int><s|m|h|d>`. */
function getDurationEnvVar(key: string, fallback: string): string {
  const value = process.env[key] || fallback;
  parseDurationSeconds(value, key);
  return value;
}

/** Retrieve required env var or throw */
function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const { nodeEnv } = flags;
const isProduction = nodeEnv === "production";
const isDevelopment = nodeEnv === "development";
const isTest = nodeEnv === "test";
// Swagger UI + OpenAPI spec: on outside production unless DOCS_ENABLED overrides it.
const docsEnabled = flags.docsEnabled ?? !isProduction;

/**
 * Allowed browser origins for CORS + the CSRF guard. Hard-coded here (not env) so
 * the list is easy to edit in one place — add your production frontend origin(s)
 * below before deploying. Keep localhost out of the production list.
 */
const corsOrigins: string[] = isProduction
  ? [
      "https://app.example.com", // ← replace with your production frontend origin(s)
    ]
  : ["http://localhost:5173", "http://localhost:9000", "http://localhost:4321"];

/** Validated environment configuration */
export const config: EnvironmentConfig = {
  port: flags.port,
  isProduction,
  isDevelopment,
  isTest,
  docsEnabled,
  appName: process.env.APP_NAME || "",
  nodeEnv,
  mongodbUri: getRequiredEnvVar("MONGODB_URI"),
  hmacSecret: getRequiredEnvVar("HMAC_SECRET"),
  jwtRefreshSecret: getRequiredEnvVar("JWT_REFRESH_SECRET"),
  jwtAccessExpiry: getDurationEnvVar("JWT_ACCESS_EXPIRY", "15m"),
  jwtRefreshExpiry: getDurationEnvVar("JWT_REFRESH_EXPIRY", "7d"),
  jwtAccessPrivateKey,
  jwtAccessPublicKey,
  corsOrigins,
  // Off by default — same-origin proxy deploy closes CSRF via SameSite; opt in for defense-in-depth.
  enableCsrf: flags.enableCsrf,
  // Unset = host-only cookie; set for split-domain deploys (e.g. ".example.com").
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  // Unset = trust no proxy; set behind a reverse proxy/LB so req.ip and rate limits use the client IP.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  // Redis is optional: not read via getRequiredEnvVar so the app boots fine when off.
  redisEnabled: flags.redisEnabled,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};
