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

/** Validated environment configuration */
export const config: EnvironmentConfig = {
  isProduction: nodeEnv === "production",
  isDevelopment: nodeEnv === "development",
  isTest: nodeEnv === "test",
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv,
  mongodbUri: getRequiredEnvVar("MONGODB_URI"),
  jwtAccessPrivateKey,
  jwtAccessPublicKey,
  jwtRefreshSecret: getRequiredEnvVar("JWT_REFRESH_SECRET"),
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  hmacSecret: getRequiredEnvVar("HMAC_SECRET"),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  // Redis is optional: not read via getRequiredEnvVar so the app boots fine when off.
  redisEnabled: process.env.REDIS_ENABLED === "true",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};
