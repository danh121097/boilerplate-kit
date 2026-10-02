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

// `true`/`false` string flag; unset or an empty `NAME=` line counts as unset => fallback.
function booleanFlag(fallback: boolean): z.ZodType<boolean, unknown> {
  return z
    .preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["true", "false"]).default(fallback ? "true" : "false"),
    )
    .transform((v) => v === "true");
}

const DEFAULT_API_PREFIX = "/api/v1";

// Trim, single leading slash, no trailing slash; empty => default. Same rules as the
// Fastify reference (`getApiPrefix`).
function normalizeApiPrefix(raw: string | undefined, ctx: z.RefinementCtx): string {
  const trimmed = (raw ?? "").trim();
  const value = trimmed || DEFAULT_API_PREFIX;
  const stripped = value.replace(/\/+$/, "");
  const prefix = stripped.startsWith("/") ? stripped : `/${stripped}`;
  if (prefix === "/" || prefix.includes("//") || prefix.includes("?")) {
    ctx.addIssue({
      code: "custom",
      message: "API_PREFIX must be a path beginning with / and contain no query string",
    });
    return z.NEVER;
  }
  return prefix;
}

const DEFAULT_DEV_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:9000",
  "http://localhost:4321",
];

function isBareOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

/** Non-production CORS origins from the comma-separated CORS_ORIGINS; unset/empty = defaults. */
export function parseDevCorsOrigins(raw: string | undefined): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_DEV_CORS_ORIGINS;
}

// Secret with a minimum length; wording mirrors the Fastify reference.
function requiredSecret(name: string): z.ZodString {
  return z
    .string({ error: `Missing required environment variable: ${name}` })
    .min(1, `Missing required environment variable: ${name}`)
    .min(32, `${name} must be at least 32 characters`);
}

export const envSchema = z
  .object({
    APP_NAME: z.string().default(""),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    API_PREFIX: z.string().optional().transform(normalizeApiPrefix),

    // Swagger UI + OpenAPI spec. Unset = on outside production, off in production.
    // An empty `DOCS_ENABLED=` line counts as unset.
    DOCS_ENABLED: z
      .preprocess((v) => (v === "" ? undefined : v), z.enum(["true", "false"]).optional())
      .transform((v) => (v === undefined ? undefined : v === "true")),

    // CSRF Origin allow-list guard (mutating methods). Off by default.
    // An empty `ENABLE_CSRF=` line counts as unset.
    ENABLE_CSRF: booleanFlag(false),

    // Non-production CORS origin list (comma-separated bare origins: scheme+host+port,
    // no path); ignored in production (not even validated), where the list lives in
    // AppConfigService. Unset/empty = the built-in localhost defaults. Checked in the
    // object-level refinement below.
    CORS_ORIGINS: z.string().optional(),

    // Include `accessToken`/`refreshToken` in register/login/refresh response bodies.
    // Set false when every client is cookie-based; token-mode clients need true.
    AUTH_TOKENS_IN_BODY: booleanFlag(true),

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
    JWT_REFRESH_SECRET: requiredSecret("JWT_REFRESH_SECRET"),
    JWT_ACCESS_EXPIRY: duration("JWT_ACCESS_EXPIRY", "15m"),
    JWT_REFRESH_EXPIRY: duration("JWT_REFRESH_EXPIRY", "7d"),

    HMAC_SECRET: requiredSecret("HMAC_SECRET"),

    // Redis is optional: the app boots fully when off.
    // An empty `REDIS_ENABLED=` line counts as unset.
    REDIS_ENABLED: booleanFlag(false),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    // Empty `LOG_LEVEL=` counts as unset: debug in development, info in production.
    LOG_LEVEL: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["debug", "info", "warn", "error"]).optional(),
    ),
  })
  // CORS_ORIGINS only applies outside production, so a bad value must not fail a
  // production boot. Wording matches the express/fastify references.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") return;
    const bad = parseDevCorsOrigins(env.CORS_ORIGINS).find((entry) => !isBareOrigin(entry));
    if (bad !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: `CORS_ORIGINS entries must be origins like http://localhost:5173: ${bad}`,
      });
    }
  });

export type EnvVars = z.infer<typeof envSchema>;

/** `validate` hook for ConfigModule.forRoot — throws on the first invalid var. */
export function validateEnv(raw: Record<string, unknown>): EnvVars {
  return envSchema.parse(raw);
}
