import { parseDevCorsOrigins } from "@/config/cors-origins";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Import a fresh `config` with `env` layered over the test setup's variables. */
async function loadConfig(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import("@/config/environment")).config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("secrets", () => {
  const strong = "x".repeat(32);

  it.each(["HMAC_SECRET", "JWT_REFRESH_SECRET"])(
    "rejects a %s shorter than 32 characters",
    async (key) => {
      await expect(loadConfig({ [key]: "x".repeat(31) })).rejects.toThrow(
        `${key} must be at least 32 characters`,
      );
    },
  );

  it.each(["HMAC_SECRET", "JWT_REFRESH_SECRET"])("rejects a missing %s", async (key) => {
    await expect(loadConfig({ [key]: "" })).rejects.toThrow(
      `Missing required environment variable: ${key}`,
    );
  });

  it("accepts secrets of exactly 32 characters", async () => {
    const config = await loadConfig({ HMAC_SECRET: strong, JWT_REFRESH_SECRET: strong });
    expect(config.hmacSecret).toBe(strong);
    expect(config.jwtRefreshSecret).toBe(strong);
  });
});

describe("API_PREFIX", () => {
  it.each([
    ["", "/api/v1"],
    ["   ", "/api/v1"],
    ["/api/v2", "/api/v2"],
    ["api", "/api"],
    ["/v2/", "/v2"],
    ["  /v2//  ", "/v2"],
  ])("normalizes %j to %s", async (raw, expected) => {
    expect((await loadConfig({ API_PREFIX: raw })).apiPrefix).toBe(expected);
  });

  it.each(["/", "//", "/a//b", "/a?x=1"])("rejects %j at boot", async (raw) => {
    await expect(loadConfig({ API_PREFIX: raw })).rejects.toThrow(/API_PREFIX must be a path/);
  });
});

describe("empty boolean flags", () => {
  it("treats empty ENABLE_CSRF and REDIS_ENABLED as their defaults", async () => {
    const config = await loadConfig({ ENABLE_CSRF: "", REDIS_ENABLED: "" });
    expect(config.enableCsrf).toBe(false);
    expect(config.redisEnabled).toBe(false);
  });
});

describe("CORS_ORIGINS", () => {
  const defaults = ["http://localhost:5173", "http://localhost:9000", "http://localhost:4321"];

  it("keeps the default dev origins when unset or blank", () => {
    expect(parseDevCorsOrigins(undefined)).toEqual(defaults);
    expect(parseDevCorsOrigins(" , ")).toEqual(defaults);
  });

  it("replaces the defaults with a trimmed comma-separated list", () => {
    expect(parseDevCorsOrigins(" http://localhost:3000 ,https://app.test:8443")).toEqual([
      "http://localhost:3000",
      "https://app.test:8443",
    ]);
  });

  it.each(["localhost:3000", "http://localhost:3000/", "http://localhost:3000/app", "*"])(
    "rejects %j (not a bare origin)",
    (entry) => {
      expect(() => parseDevCorsOrigins(`http://localhost:5173,${entry}`)).toThrow(
        /CORS_ORIGINS entries must be origins/,
      );
    },
  );

  it("feeds config.corsOrigins outside production", async () => {
    const config = await loadConfig({ CORS_ORIGINS: "http://localhost:3000" });
    expect(config.corsOrigins).toEqual(["http://localhost:3000"]);
  });

  it("is ignored in production", async () => {
    const config = await loadConfig({
      NODE_ENV: "production",
      CORS_ORIGINS: "http://localhost:3000",
    });
    expect(config.corsOrigins).not.toContain("http://localhost:3000");
  });
});

describe("AUTH_TOKENS_IN_BODY", () => {
  it.each([
    ["", true],
    ["true", true],
    ["false", false],
  ])("%j gives authTokensInBody=%s", async (raw, expected) => {
    expect((await loadConfig({ AUTH_TOKENS_IN_BODY: raw })).authTokensInBody).toBe(expected);
  });
});
