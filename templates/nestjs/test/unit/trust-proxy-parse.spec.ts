import { validateEnv } from "@/config/env.schema";
import { parseTrustProxy } from "@/config/trust-proxy.util";
import { describe, expect, it } from "vitest";

describe("parseTrustProxy", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["  ", undefined],
    ["true", true],
    ["false", false],
    ["0", 0],
    ["2", 2],
    ["10.0.0.1", "10.0.0.1"],
    ["10.0.0.0/8, 192.168.1.5", "10.0.0.0/8,192.168.1.5"],
    ["::1,fd00::/8", "::1,fd00::/8"],
    ["loopback", "loopback"],
  ])("accepts %j", (raw, expected) => {
    expect(parseTrustProxy(raw)).toBe(expected);
  });

  it.each(["yes", "1.5", "-1", "10.0.0.0/33", "10.0.0.1,nope", "10.0.0.0/8/8", "fd00::/129"])(
    "rejects %j",
    (raw) => {
      expect(parseTrustProxy(raw)).toBeNull();
    },
  );
});

describe("env schema TRUST_PROXY", () => {
  const base = {
    MONGODB_URI: "mongodb://localhost/test",
    JWT_REFRESH_SECRET: "x".repeat(32),
    HMAC_SECRET: "y".repeat(32),
  };

  it("is undefined when unset (do not trust)", () => {
    expect(validateEnv(base).TRUST_PROXY).toBeUndefined();
  });

  it("parses a hop count", () => {
    expect(validateEnv({ ...base, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
  });

  it("fails boot on an invalid value", () => {
    expect(() => validateEnv({ ...base, TRUST_PROXY: "maybe" })).toThrow(/TRUST_PROXY/);
  });
});

describe("env schema JWT expiry", () => {
  const base = {
    MONGODB_URI: "mongodb://localhost/test",
    JWT_REFRESH_SECRET: "x".repeat(32),
    HMAC_SECRET: "y".repeat(32),
  };

  it("accepts positive <n><s|m|h|d>", () => {
    const env = validateEnv({ ...base, JWT_ACCESS_EXPIRY: "30s", JWT_REFRESH_EXPIRY: "14d" });
    expect([env.JWT_ACCESS_EXPIRY, env.JWT_REFRESH_EXPIRY]).toEqual(["30s", "14d"]);
  });

  it.each(["900", "1w", "0", "0m", "-5m", "1.5h", "15 m", "abc"])("fails boot on %j", (raw) => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_EXPIRY: raw })).toThrow(/JWT_ACCESS_EXPIRY/);
    expect(() => validateEnv({ ...base, JWT_REFRESH_EXPIRY: raw })).toThrow(/JWT_REFRESH_EXPIRY/);
  });
});
