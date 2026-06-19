import { z } from "zod";

// Validated shape of `process.env`. `@nestjs/config` runs `validate` at boot, so a
// missing/invalid var fails loudly on startup rather than at first use. Coercions
// keep the raw string env compatible with typed getters in AppConfigService.
export const envSchema = z.object({
  APP_NAME: z.string().default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  API_PREFIX: z.string().default("/api/v1"),

  // CSRF Origin allow-list guard (mutating methods). Off by default.
  ENABLE_CSRF: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Unset = host-only cookie; set for split-domain deploys (e.g. ".example.com").
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),

  JWT_PRIVATE_KEY_PATH: z.string().default("src/keys/rsa.private"),
  JWT_PUBLIC_KEY_PATH: z.string().default("src/keys/rsa.public"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),

  HMAC_SECRET: z.string().min(1, "HMAC_SECRET is required"),

  // Redis is optional: the app boots fully when off.
  REDIS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

export type EnvVars = z.infer<typeof envSchema>;

/** `validate` hook for ConfigModule.forRoot — throws on the first invalid var. */
export function validateEnv(raw: Record<string, unknown>): EnvVars {
  return envSchema.parse(raw);
}
