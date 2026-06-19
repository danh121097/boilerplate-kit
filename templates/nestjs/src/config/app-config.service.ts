import { loadRsaKeyPair } from "@/config/keys";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvVars } from "@/config/env.schema";

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
  get jwtRefreshSecret(): string {
    return this.get("JWT_REFRESH_SECRET");
  }
  get jwtAccessExpiry(): string {
    return this.get("JWT_ACCESS_EXPIRY");
  }
  get jwtRefreshExpiry(): string {
    return this.get("JWT_REFRESH_EXPIRY");
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
   * Allowed browser origins for CORS + the CSRF guard. Hard-coded here (not env)
   * so the list is easy to edit in one place — add your production frontend
   * origin(s) below before deploying. Keep localhost out of the production list.
   */
  get corsOrigins(): string[] {
    return this.isProduction
      ? [
          "https://app.example.com", // ← replace with your production frontend origin(s)
        ]
      : ["http://localhost:5173", "http://localhost:9000", "http://localhost:4321"];
  }
}
