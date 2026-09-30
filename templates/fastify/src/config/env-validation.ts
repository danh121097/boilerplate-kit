import { z } from "zod";

/** An unset or empty variable counts as absent; anything else must be `true` or `false`. */
const optionalBoolean = z
  .preprocess((v) => (v === "" ? undefined : v), z.enum(["true", "false"]).optional())
  .transform((v) => (v === undefined ? undefined : v === "true"));

const flagsSchema = z.object({
  NODE_ENV: z
    .preprocess((v) => (v === "" ? undefined : v), z.enum(["development", "production", "test"]))
    .default("development"),
  PORT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().positive().default(3000),
  ),
  ENABLE_CSRF: optionalBoolean,
  REDIS_ENABLED: optionalBoolean,
  DOCS_ENABLED: optionalBoolean,
});

export interface EnvironmentFlags {
  nodeEnv: "development" | "production" | "test";
  port: number;
  enableCsrf: boolean;
  redisEnabled: boolean;
  /** `undefined` = not set, so the caller picks the default (on outside production). */
  docsEnabled: boolean | undefined;
}

/** Validate NODE_ENV, PORT and the boolean flags, failing boot with every problem listed. */
export function parseEnvironmentFlags(env: NodeJS.ProcessEnv = process.env): EnvironmentFlags {
  const result = flagsSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const v = result.data;
  return {
    nodeEnv: v.NODE_ENV,
    port: v.PORT,
    enableCsrf: v.ENABLE_CSRF ?? false,
    redisEnabled: v.REDIS_ENABLED ?? false,
    docsEnabled: v.DOCS_ENABLED,
  };
}
