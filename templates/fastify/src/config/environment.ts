import { parseDevCorsOrigins } from "@/config/cors-origins";
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

function getRequiredSecret(key: string): string {
  const value = getRequiredEnvVar(key);
  if (value.length < 32) throw new Error(`${key} must be at least 32 characters`);
  return value;
}

function getApiPrefix(): string {
  const raw = process.env.API_PREFIX?.trim() || "/api/v1";
  const prefix = raw.startsWith("/") ? raw.replace(/\/+$/, "") : `/${raw.replace(/\/+$/, "")}`;
  if (!prefix || prefix.includes("//") || prefix.includes("?")) {
    throw new Error("API_PREFIX must be a path beginning with / and contain no query string");
  }
  return prefix;
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/** LOG_LEVEL if valid; otherwise `info` in production and `debug` elsewhere. */
function getLogLevel(isProd: boolean): EnvironmentConfig["logLevel"] {
  const value = process.env.LOG_LEVEL as EnvironmentConfig["logLevel"] | undefined;
  if (value && LOG_LEVELS.includes(value)) return value;
  return isProd ? "info" : "debug";
}

const { nodeEnv } = flags;
const isProduction = nodeEnv === "production";
const isDevelopment = nodeEnv === "development";
const isTest = nodeEnv === "test";
// Swagger UI + OpenAPI spec: on outside production unless DOCS_ENABLED overrides it.
const docsEnabled = flags.docsEnabled ?? !isProduction;

/**
 * Allowed browser origins for CORS + the CSRF guard. The production list is hard-coded
 * here so it is easy to edit in one place — add your production frontend origin(s)
 * below before deploying and keep localhost out of it. Outside production the default
 * dev ports can be replaced with CORS_ORIGINS (comma-separated).
 */
const corsOrigins: string[] = isProduction
  ? [
      "https://app.example.com", // ← replace with your production frontend origin(s)
    ]
  : parseDevCorsOrigins(process.env.CORS_ORIGINS);

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
  hmacSecret: getRequiredSecret("HMAC_SECRET"),
  jwtRefreshSecret: getRequiredSecret("JWT_REFRESH_SECRET"),
  jwtAccessExpiry: getDurationEnvVar("JWT_ACCESS_EXPIRY", "15m"),
  jwtRefreshExpiry: getDurationEnvVar("JWT_REFRESH_EXPIRY", "7d"),
  jwtAccessPrivateKey,
  jwtAccessPublicKey,
  corsOrigins,
  // Off by default — same-origin proxy deploy closes CSRF via SameSite; opt in for defense-in-depth.
  enableCsrf: flags.enableCsrf,
  // Unset = host-only cookie; set for split-domain deploys (e.g. ".example.com").
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  // Unset = trust no proxy; explicit proxy ranges let request.ip and rate limits use the client IP.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  apiPrefix: getApiPrefix(),
  authTokensInBody: flags.authTokensInBody,
  // Redis is optional: not read via getRequiredEnvVar so the app boots fine when off.
  redisEnabled: flags.redisEnabled,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  logLevel: getLogLevel(isProduction),
};
