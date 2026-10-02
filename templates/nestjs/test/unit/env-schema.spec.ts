import { describe, expect, it } from "vitest";

import { parseDevCorsOrigins, validateEnv } from "@/config/env.schema";

const base = {
  MONGODB_URI: "mongodb://localhost/test",
  JWT_REFRESH_SECRET: "x".repeat(32),
  HMAC_SECRET: "y".repeat(32),
};

describe("env schema secrets", () => {
  it.each(["HMAC_SECRET", "JWT_REFRESH_SECRET"])("accepts a 32-char %s", (name) => {
    expect(() => validateEnv({ ...base, [name]: "z".repeat(32) })).not.toThrow();
  });

  it.each(["HMAC_SECRET", "JWT_REFRESH_SECRET"])("rejects a 31-char %s", (name) => {
    expect(() => validateEnv({ ...base, [name]: "z".repeat(31) })).toThrow(
      `${name} must be at least 32 characters`,
    );
  });

  it.each(["HMAC_SECRET", "JWT_REFRESH_SECRET"])("reports a missing or empty %s", (name) => {
    const { [name as keyof typeof base]: _omitted, ...without } = base;
    expect(() => validateEnv(without)).toThrow(`Missing required environment variable: ${name}`);
    expect(() => validateEnv({ ...base, [name]: "" })).toThrow(
      `Missing required environment variable: ${name}`,
    );
  });
});

describe("env schema boolean flags", () => {
  it.each([
    ["ENABLE_CSRF", false],
    ["REDIS_ENABLED", false],
    ["AUTH_TOKENS_IN_BODY", true],
  ] as const)("%s: unset and empty both fall back to the default", (name, fallback) => {
    expect(validateEnv(base)[name]).toBe(fallback);
    expect(validateEnv({ ...base, [name]: "" })[name]).toBe(fallback);
  });

  it.each(["ENABLE_CSRF", "REDIS_ENABLED", "AUTH_TOKENS_IN_BODY"] as const)(
    "%s accepts true/false and rejects anything else",
    (name) => {
      expect(validateEnv({ ...base, [name]: "true" })[name]).toBe(true);
      expect(validateEnv({ ...base, [name]: "false" })[name]).toBe(false);
      expect(() => validateEnv({ ...base, [name]: "yes" })).toThrow(name);
    },
  );
});

describe("env schema API_PREFIX", () => {
  it.each([
    [undefined, "/api/v1"],
    ["", "/api/v1"],
    ["   ", "/api/v1"],
    ["/api/v1", "/api/v1"],
    ["api/v1", "/api/v1"],
    ["/api/v1/", "/api/v1"],
    ["api/v2//", "/api/v2"],
    ["  /svc  ", "/svc"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(validateEnv({ ...base, API_PREFIX: raw }).API_PREFIX).toBe(expected);
  });

  it.each(["/", "//", "/a//b", "/api?x=1"])("rejects %j", (raw) => {
    expect(() => validateEnv({ ...base, API_PREFIX: raw })).toThrow(/API_PREFIX/);
  });
});

describe("env schema CORS_ORIGINS", () => {
  it("accepts bare origins and rejects anything else at boot", () => {
    expect(() =>
      validateEnv({ ...base, CORS_ORIGINS: "http://localhost:3000, https://app.example.com" }),
    ).not.toThrow();
    for (const bad of [
      "localhost:3000",
      "http://localhost:3000/app",
      "http://localhost:3000/",
      "*",
    ]) {
      expect(() => validateEnv({ ...base, CORS_ORIGINS: bad })).toThrow(
        `CORS_ORIGINS entries must be origins like http://localhost:5173: ${bad}`,
      );
    }
  });

  it("ignores CORS_ORIGINS entirely in production, even when invalid", () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: "production", CORS_ORIGINS: "*, localhost:3000/x" }),
    ).not.toThrow();
  });
});

describe("parseDevCorsOrigins", () => {
  const defaults = ["http://localhost:5173", "http://localhost:9000", "http://localhost:4321"];

  it.each([undefined, "", " , "])("falls back to the defaults for %j", (raw) => {
    expect(parseDevCorsOrigins(raw)).toEqual(defaults);
  });

  it("splits and trims a comma-separated override", () => {
    expect(parseDevCorsOrigins("http://localhost:3000, http://localhost:3001,")).toEqual([
      "http://localhost:3000",
      "http://localhost:3001",
    ]);
  });
});
