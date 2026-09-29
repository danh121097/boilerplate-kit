import { parseDurationSeconds } from "@/config/duration";
import { config } from "@/config/environment";
import { setTokenCookies } from "@/utils/cookie";
import { accessTtlSeconds, refreshTtlSeconds } from "@/utils/token-lifetimes";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("parseDurationSeconds", () => {
  it("parses s/m/h/d units", () => {
    expect(parseDurationSeconds("30s")).toBe(30);
    expect(parseDurationSeconds("15m")).toBe(900);
    expect(parseDurationSeconds("2h")).toBe(7200);
    expect(parseDurationSeconds("7d")).toBe(604800);
  });

  it.each(["900", "1w", "0", "0m", "-5m", "", "abc", "1.5h"])("rejects %j", (raw) => {
    expect(() => parseDurationSeconds(raw, "JWT_ACCESS_EXPIRY")).toThrow(/JWT_ACCESS_EXPIRY/);
  });
});

describe("boot validation of token expiries", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(["900", "1w", "0"])("fails boot when JWT_REFRESH_EXPIRY is %j", async (value) => {
    vi.stubEnv("JWT_REFRESH_EXPIRY", value);
    vi.resetModules();
    await expect(import("@/config/environment")).rejects.toThrow(/JWT_REFRESH_EXPIRY/);
  });

  it("fails boot when JWT_ACCESS_EXPIRY is invalid", async () => {
    vi.stubEnv("JWT_ACCESS_EXPIRY", "900");
    vi.resetModules();
    await expect(import("@/config/environment")).rejects.toThrow(/JWT_ACCESS_EXPIRY/);
  });
});

describe("token lifetimes follow config", () => {
  const original = { access: config.jwtAccessExpiry, refresh: config.jwtRefreshExpiry };
  afterEach(() => {
    config.jwtAccessExpiry = original.access;
    config.jwtRefreshExpiry = original.refresh;
  });

  it("reads the configured access and refresh expiries", () => {
    expect(accessTtlSeconds()).toBe(15 * 60);
    expect(refreshTtlSeconds()).toBe(7 * 24 * 3600);
    config.jwtAccessExpiry = "5m";
    config.jwtRefreshExpiry = "30d";
    expect(accessTtlSeconds()).toBe(300);
    expect(refreshTtlSeconds()).toBe(30 * 24 * 3600);
  });

  it("derives cookie maxAge from the configured expiries", () => {
    config.jwtAccessExpiry = "5m";
    config.jwtRefreshExpiry = "30d";
    const cookie = vi.fn();
    setTokenCookies({ cookie } as never, "a", "r");
    const maxAge = (name: string): number => cookie.mock.calls.find(([n]) => n === name)![2].maxAge;
    expect(maxAge("accessToken")).toBe(5 * 60 * 1000);
    expect(maxAge("refreshToken")).toBe(30 * 24 * 3600 * 1000);
  });
});
