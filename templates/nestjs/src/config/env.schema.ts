import { DURATION_PATTERN, parseDurationSeconds } from "@/common/utils/duration.util";
import { parseTrustProxy } from "@/config/trust-proxy.util";
import { z } from "zod";

// Validated shape of `process.env`. `@nestjs/config` runs `validate` at boot, so a
// missing/invalid var fails loudly on startup rather than at first use. Coercions
// keep the raw string env compatible with typed getters in AppConfigService.
// `<positive int><s|m|h|d>` only (e.g. 15m, 7d); anything else fails boot.
function duration(name: string, fallback: string): z.ZodDefault<z.ZodString> {
  return z
    .string()
    .default(fallback)
    .refine((v) => DURATION_PATTERN.test(v.trim()) && parseDurationSeconds(v, name) > 0, {
      message: `${name} must be a positive number followed by s, m, h or d (e.g. 15m, 7d)`,
    });
}

export const envSchema = z.object({
  APP_NAME: z.string().default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  API_PREFIX: z.string().default("/api/v1"),

  // Swagger UI + OpenAPI spec. Unset = on outside production, off in production.
  // An empty `DOCS_ENABLED=` line counts as unset.
  DOCS_ENABLED: z
    .preprocess((v) => (v === "" ? undefined : v), z.enum(["true", "false"]).optional())
    .transform((v) => (v === undefined ? undefined : v === "true")),

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

  // Trust X-Forwarded-* from a reverse proxy: `true`/`false`, a hop count, or a
  // comma-separated list of IPs/subnets. Unset = do not trust.
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const parsed = parseTrustProxy(v);
      if (parsed === null) {
        ctx.addIssue({
          code: "custom",
          message:
            "TRUST_PROXY must be true, false, a hop count, or a comma-separated list of IPs/subnets",
        });
        return z.NEVER;
      }
      return parsed;
    }),

  JWT_PRIVATE_KEY_PATH: z.string().default("src/keys/rsa.private"),
  JWT_PUBLIC_KEY_PATH: z.string().default("src/keys/rsa.public"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRY: duration("JWT_ACCESS_EXPIRY", "15m"),
  JWT_REFRESH_EXPIRY: duration("JWT_REFRESH_EXPIRY", "7d"),

  HMAC_SECRET: z.string().min(1, "HMAC_SECRET is required"),

  // Redis is optional: the app boots fully when off.
  REDIS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Empty `LOG_LEVEL=` counts as unset: debug in development, info in production.
  LOG_LEVEL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["debug", "info", "warn", "error"]).optional(),
  ),
});

export type EnvVars = z.infer<typeof envSchema>;

/** `validate` hook for ConfigModule.forRoot — throws on the first invalid var. */
export function validateEnv(raw: Record<string, unknown>): EnvVars {
  return envSchema.parse(raw);
}
