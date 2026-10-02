import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Boot-time validation in config/environment.ts, exercised by importing the module
 * afresh with stubbed variables (it reads process.env once at load).
 */

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://localhost:9000", "http://localhost:4321"];

async function loadConfig() {
  vi.resetModules();
  return (await import("@/config/environment")).config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("required secrets", () => {
  it.each(["HMAC_SECRET", "JWT_REFRESH_SECRET"])(
    "rejects a %s shorter than 32 characters",
    async (key) => {
      vi.stubEnv(key, "x".repeat(31));
      await expect(loadConfig()).rejects.toThrow(`${key} must be at least 32 characters`);
    },
  );

  it.each(["HMAC_SECRET", "JWT_REFRESH_SECRET"])("rejects a missing %s", async (key) => {
    vi.stubEnv(key, "");
    await expect(loadConfig()).rejects.toThrow(`Missing required environment variable: ${key}`);
  });

  it("accepts secrets of exactly 32 characters", async () => {
    vi.stubEnv("HMAC_SECRET", "h".repeat(32));
    vi.stubEnv("JWT_REFRESH_SECRET", "j".repeat(32));
    const config = await loadConfig();
    expect(config.hmacSecret).toHaveLength(32);
    expect(config.jwtRefreshSecret).toHaveLength(32);
  });
});

describe("API_PREFIX", () => {
  it.each([
    [undefined, "/api/v1"],
    ["", "/api/v1"],
    ["   ", "/api/v1"],
    ["/api/v1", "/api/v1"],
    ["api/v2", "/api/v2"],
    ["  /api/v2/  ", "/api/v2"],
    ["/api/v2///", "/api/v2"],
  ])("normalizes %j to %s", async (raw, expected) => {
    vi.stubEnv("API_PREFIX", raw);
    expect((await loadConfig()).apiPrefix).toBe(expected);
  });

  it.each(["/", "//", "/a//b", "/api?x=1"])("rejects %j", async (raw) => {
    vi.stubEnv("API_PREFIX", raw);
    await expect(loadConfig()).rejects.toThrow(
      "API_PREFIX must be a path beginning with / and contain no query string",
    );
  });
});

describe("CORS_ORIGINS (non-production)", () => {
  it("defaults to the dev ports when unset or empty", async () => {
    vi.stubEnv("CORS_ORIGINS", "");
    expect((await loadConfig()).corsOrigins).toEqual(DEFAULT_ORIGINS);
  });

  it("replaces the dev list with the comma-separated origins", async () => {
    vi.stubEnv("CORS_ORIGINS", " http://localhost:3001 ,https://dev.example.com,, ");
    expect((await loadConfig()).corsOrigins).toEqual([
      "http://localhost:3001",
      "https://dev.example.com",
    ]);
  });

  it.each(["localhost:3001", "http://localhost:3001/", "http://localhost:3001/app", "*"])(
    "rejects the non-origin entry %j",
    async (entry) => {
      vi.stubEnv("CORS_ORIGINS", entry);
      await expect(loadConfig()).rejects.toThrow("CORS_ORIGINS entries must be origins");
    },
  );

  it("is ignored in production, which keeps its hard-coded list", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ORIGINS", "http://localhost:3001");
    expect((await loadConfig()).corsOrigins).toEqual(["https://app.example.com"]);
  });
});
