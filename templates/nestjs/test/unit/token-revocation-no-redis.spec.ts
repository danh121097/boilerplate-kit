/**
 * Unit tests for TokenRevocationService and CacheService when Redis is disabled
 * (getClient() returns null).
 *
 * Both services must be pure no-ops in this mode — no throw, no state change.
 * This behaviour is the documented "fail-open" contract: a Redis outage must
 * never lock users out.
 *
 * We construct the services directly (no NestJS DI) using a RedisService stub
 * whose getClient() always returns null.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConfigService } from "@/config/app-config.service";
import { AppLogger } from "@/common/logger/app-logger.service";
import { CacheService } from "@/common/cache.service";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "@/redis/redis.service";
import { TokenRevocationService } from "@/common/token-revocation.service";
import type { EnvVars } from "@/config/env.schema";

// ── Stubs ──────────────────────────────────────────────────────────────────

/** RedisService stub that simulates REDIS_ENABLED=false. */
function makeNullRedisService(): RedisService {
  return {
    getClient: () => null,
  } as unknown as RedisService;
}

/** Minimal AppLogger stub — captures warn calls for assertion. */
function makeLoggerStub() {
  return {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as AppLogger;
}

/** AppConfigService stub — only jwtAccessExpiry needed by TokenRevocationService. */
function makeConfigStub(jwtAccessExpiry = "15m"): AppConfigService {
  const inner = {
    get: (key: string) => {
      if (key === "JWT_ACCESS_EXPIRY") return jwtAccessExpiry;
      return process.env[key];
    },
  } as unknown as ConfigService<EnvVars, true>;
  // Use the real AppConfigService but override accessExpiry via env so the RSA
  // key load (already done in setup.ts) doesn't re-run. We only need the expiry
  // getter; construct normally.
  return new AppConfigService(inner);
}

// ── TokenRevocationService (Redis disabled) ────────────────────────────────

describe("TokenRevocationService — Redis disabled (no-op)", () => {
  let svc: TokenRevocationService;
  let logger: AppLogger;

  beforeEach(() => {
    logger = makeLoggerStub();
    const redis = makeNullRedisService();
    const config = makeConfigStub();
    svc = new TokenRevocationService(redis, config, logger);
  });

  it("revokeUserTokens is a no-op — resolves without error", async () => {
    await expect(svc.revokeUserTokens("user-123")).resolves.toBeUndefined();
  });

  it("getUserRevokedAt returns null — no Redis call made", async () => {
    const result = await svc.getUserRevokedAt("user-123");
    expect(result).toBeNull();
  });

  it("multiple calls do not throw", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(svc.revokeUserTokens(`uid-${i}`)).resolves.toBeUndefined();
      await expect(svc.getUserRevokedAt(`uid-${i}`)).resolves.toBeNull();
    }
  });
});

// ── TokenRevocationService.accessTtlSeconds ────────────────────────────────

describe("TokenRevocationService.accessTtlSeconds", () => {
  function make(expiry: string) {
    const redis = makeNullRedisService();
    const logger = makeLoggerStub();
    const config = makeConfigStub(expiry);
    return new TokenRevocationService(redis, config, logger);
  }

  it.each([
    ["15m", 15 * 60],
    ["900s", 900],
    ["1h", 3600],
    ["7d", 7 * 86400],
    ["900", 900],
  ])("expiry %s → %i seconds", (raw, expected) => {
    // We can't easily override the getter on the real service, so test the
    // parsing by patching the config accessor indirectly via env. Instead,
    // test the numeric outcomes via the service method when the real config
    // is set in process.env.
    process.env.JWT_ACCESS_EXPIRY = raw;
    const inner = {
      get: (key: string) => process.env[key],
    } as unknown as ConfigService<EnvVars, true>;
    const appConfig = new AppConfigService(inner);
    const svc = new TokenRevocationService(makeNullRedisService(), appConfig, makeLoggerStub());
    expect(svc.accessTtlSeconds()).toBe(expected);
    // Restore
    process.env.JWT_ACCESS_EXPIRY = "15m";
  });

  it("invalid string → 900 (default fallback)", () => {
    process.env.JWT_ACCESS_EXPIRY = "invalid";
    const inner = {
      get: (key: string) => process.env[key],
    } as unknown as ConfigService<EnvVars, true>;
    const appConfig = new AppConfigService(inner);
    const svc = new TokenRevocationService(makeNullRedisService(), appConfig, makeLoggerStub());
    expect(svc.accessTtlSeconds()).toBe(900);
    process.env.JWT_ACCESS_EXPIRY = "15m";
  });
});

// ── CacheService (Redis disabled) ─────────────────────────────────────────

describe("CacheService — Redis disabled (no-op)", () => {
  let cache: CacheService;
  let logger: AppLogger;

  beforeEach(() => {
    logger = makeLoggerStub();
    cache = new CacheService(makeNullRedisService(), logger);
  });

  it("get returns null (cache miss, Redis off)", async () => {
    const result = await cache.get<string>("some-key");
    expect(result).toBeNull();
  });

  it("set resolves without error", async () => {
    await expect(cache.set("some-key", { data: 1 }, 60)).resolves.toBeUndefined();
  });

  it("del resolves without error", async () => {
    await expect(cache.del("some-key")).resolves.toBeUndefined();
  });

  it("get after set still returns null (Redis off — nothing stored)", async () => {
    await cache.set("key", "value", 60);
    const result = await cache.get<string>("key");
    expect(result).toBeNull();
  });
});
