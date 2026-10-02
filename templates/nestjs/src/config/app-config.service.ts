import { parseDurationSeconds } from "@/common/utils/duration.util";
import { parseDevCorsOrigins } from "@/config/env.schema";
import { loadRsaKeyPair } from "@/config/keys";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvVars } from "@/config/env.schema";
import type { TrustProxyValue } from "@/config/trust-proxy.util";

/**
 * Typed, immutable view over validated env vars + derived config. Inject this
 * everywhere instead of reading `process.env`. Loads + self-tests the RSA keypair
 * once at construction (fail-closed outside dev/test).
 */
@Injectable()
export class AppConfigService {
  private readonly accessPrivateKey: string;
  private readonly accessPublicKey: string;

  constructor(private readonly config: ConfigService<EnvVars, true>) {
    const { privateKey, publicKey } = loadRsaKeyPair(
      this.get("JWT_PRIVATE_KEY_PATH"),
      this.get("JWT_PUBLIC_KEY_PATH"),
      this.get("NODE_ENV"),
    );
    this.accessPrivateKey = privateKey;
    this.accessPublicKey = publicKey;
  }

  private get<K extends keyof EnvVars>(key: K): EnvVars[K] {
    return this.config.get(key, { infer: true });
  }

  get appName(): string {
    return this.get("APP_NAME");
  }
  get nodeEnv(): string {
    return this.get("NODE_ENV");
  }
  get isProduction(): boolean {
    return this.get("NODE_ENV") === "production";
  }
  get isDevelopment(): boolean {
    return this.get("NODE_ENV") === "development";
  }
  get docsEnabled(): boolean {
    return this.get("DOCS_ENABLED") ?? !this.isProduction;
  }
  get isTest(): boolean {
    return this.get("NODE_ENV") === "test";
  }
  get port(): number {
    return this.get("PORT");
  }
  get mongodbUri(): string {
    return this.get("MONGODB_URI");
  }
  get apiPrefix(): string {
    return this.get("API_PREFIX");
  }
  get enableCsrf(): boolean {
    return this.get("ENABLE_CSRF");
  }
  get cookieDomain(): string | undefined {
    return this.get("COOKIE_DOMAIN");
  }
  get trustProxy(): TrustProxyValue | undefined {
    return this.get("TRUST_PROXY");
  }
  get jwtRefreshSecret(): string {
    return this.get("JWT_REFRESH_SECRET");
  }
  get jwtAccessExpiry(): string {
    return this.get("JWT_ACCESS_EXPIRY");
  }
  get jwtRefreshExpiry(): string {
    return this.get("JWT_REFRESH_EXPIRY");
  }
  /** Access lifetime in seconds — drives the access cookie maxAge. */
  get jwtAccessTtlSeconds(): number {
    return parseDurationSeconds(this.jwtAccessExpiry, "JWT_ACCESS_EXPIRY");
  }
  /** Refresh lifetime in seconds — drives the refresh cookie maxAge and DB expiresAt. */
  get jwtRefreshTtlSeconds(): number {
    return parseDurationSeconds(this.jwtRefreshExpiry, "JWT_REFRESH_EXPIRY");
  }
  get jwtAccessPrivateKey(): string {
    return this.accessPrivateKey;
  }
  get jwtAccessPublicKey(): string {
    return this.accessPublicKey;
  }
  get hmacSecret(): string {
    return this.get("HMAC_SECRET");
  }
  get authTokensInBody(): boolean {
    return this.get("AUTH_TOKENS_IN_BODY");
  }
  get redisEnabled(): boolean {
    return this.get("REDIS_ENABLED");
  }
  get redisUrl(): string {
    return this.get("REDIS_URL");
  }
  get logLevel(): string | undefined {
    return this.get("LOG_LEVEL");
  }

  /**
   * Allowed browser origins for CORS + the CSRF guard. The production list is
   * hard-coded here so it is easy to edit in one place — add your production
   * frontend origin(s) below before deploying and keep localhost out of it. Outside
   * production the list comes from CORS_ORIGINS (default: the localhost trio).
   */
  get corsOrigins(): string[] {
    return this.isProduction
      ? [
          "https://app.example.com", // ← replace with your production frontend origin(s)
        ]
      : parseDevCorsOrigins(this.get("CORS_ORIGINS"));
  }
}
