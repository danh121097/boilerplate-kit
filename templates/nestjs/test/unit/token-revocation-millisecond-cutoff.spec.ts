/**
 * Access-token revocation at millisecond precision: a token issued before a logout
 * is revoked even inside the same second, and one issued after it is not.
 */
import { describe, expect, it, vi } from "vitest";

import { AppLogger } from "@/common/logger/app-logger.service";
import { TokenRevocationService, isTokenRevoked } from "@/common/services/token-revocation.service";
import { TokenService } from "@/common/services/token.service";
import { AppConfigService } from "@/config/app-config.service";
import type { EnvVars } from "@/config/env.schema";
import { RedisService } from "@/redis/redis.service";
import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";

const config = new AppConfigService({
  get: (key: string) => process.env[key],
} as unknown as ConfigService<EnvVars, true>);

const PAYLOAD = {
  userId: "507f1f77bcf86cd799439011",
  email: "a@example.com",
  role: "user" as const,
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** In-memory ioredis stand-in reporting the given connection status. */
function fakeRedis(status: string) {
  const store = new Map<string, string>();
  const client = {
    status,
    set: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
  };
  return { client, store, service: { getClient: () => client } as unknown as RedisService };
}

const logger = { warn: vi.fn() } as unknown as AppLogger;

describe("revocation cutoff (milliseconds)", () => {
  it("revokes a token issued before the revoke and keeps one issued after it, in the same second", async () => {
    const tokens = new TokenService(config);
    const { service } = fakeRedis("ready");
    const revocation = new TokenRevocationService(service, config, logger);

    const before = jwt.decode(tokens.signAccessToken(PAYLOAD)) as { iat: number; iat_ms: number };
    await sleep(5);
    await revocation.revokeUserTokens(PAYLOAD.userId);
    await sleep(5);
    const after = jwt.decode(tokens.signAccessToken(PAYLOAD)) as { iat: number; iat_ms: number };

    expect(after.iat_ms).toBeGreaterThan(before.iat_ms);
    const cutoff = await revocation.getUserRevokedAt(PAYLOAD.userId);
    expect(cutoff).toBeGreaterThan(1e11);
    expect(isTokenRevoked(before, cutoff)).toBe(true);
    expect(isTokenRevoked(after, cutoff)).toBe(false);
  });

  it("falls back to iat * 1000 for tokens without iat_ms", () => {
    expect(isTokenRevoked({ iat: 100 }, 100_001)).toBe(true);
    expect(isTokenRevoked({ iat: 100 }, 100_000)).toBe(false);
    expect(isTokenRevoked({ iat: 100 }, null)).toBe(false);
  });

  it("scales a legacy epoch-seconds cutoff to milliseconds", async () => {
    const { store, service } = fakeRedis("ready");
    store.set(`revoked:user:${PAYLOAD.userId}`, "1700000000");
    const revocation = new TokenRevocationService(service, config, logger);
    expect(await revocation.getUserRevokedAt(PAYLOAD.userId)).toBe(1_700_000_000_000);
  });
});

describe("Redis not ready (outage) — fail open without touching the client", () => {
  it("revocation read returns null, write is skipped with a warn", async () => {
    const { client, service } = fakeRedis("reconnecting");
    const warn = vi.fn();
    const revocation = new TokenRevocationService(service, config, {
      warn,
    } as unknown as AppLogger);

    const started = Date.now();
    expect(await revocation.getUserRevokedAt(PAYLOAD.userId)).toBeNull();
    await revocation.revokeUserTokens(PAYLOAD.userId);

    expect(Date.now() - started).toBeLessThan(100);
    expect(client.get).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});
