/**
 * Unit tests for TokenService — sign/verify access+refresh tokens,
 * token_use mismatch rejection, hashToken determinism.
 *
 * Runs entirely in-process (no NestJS DI bootstrap). Uses the RSA keypair
 * written to disk by test/setup.ts via process.env.JWT_PRIVATE_KEY_PATH.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { AppConfigService } from "@/config/app-config.service";
import { TokenService } from "@/common/token.service";
import { ConfigService } from "@nestjs/config";
import type { EnvVars } from "@/config/env.schema";

// ---------------------------------------------------------------------------
// Build a real AppConfigService backed by process.env (set by test/setup.ts).
// ---------------------------------------------------------------------------
function makeConfigService(): AppConfigService {
  const configService = {
    get: <K extends keyof EnvVars>(key: K): EnvVars[K] => {
      return process.env[key as string] as EnvVars[K];
    },
  } as ConfigService<EnvVars, true>;
  return new AppConfigService(configService);
}

const SAMPLE_PAYLOAD = {
  userId: "507f1f77bcf86cd799439011",
  email: "test@example.com",
  role: "user" as const,
};

describe("TokenService", () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService(makeConfigService());
  });

  // ── Access tokens ──────────────────────────────────────────────────────────

  describe("signAccessToken / verifyAccessToken", () => {
    it("round-trips a valid access token", () => {
      const token = tokenService.signAccessToken(SAMPLE_PAYLOAD);
      expect(token).toBeTypeOf("string");
      expect(token.split(".")).toHaveLength(3); // JWT structure

      const decoded = tokenService.verifyAccessToken(token);
      expect(decoded.userId).toBe(SAMPLE_PAYLOAD.userId);
      expect(decoded.email).toBe(SAMPLE_PAYLOAD.email);
      expect(decoded.role).toBe(SAMPLE_PAYLOAD.role);
    });

    it("throws when a refresh token is passed to verifyAccessToken (token_use mismatch)", () => {
      const refreshToken = tokenService.signRefreshToken(SAMPLE_PAYLOAD);
      expect(() => tokenService.verifyAccessToken(refreshToken)).toThrow();
    });

    it("throws for a tampered access token", () => {
      const token = tokenService.signAccessToken(SAMPLE_PAYLOAD);
      const tampered = token.slice(0, -4) + "XXXX";
      expect(() => tokenService.verifyAccessToken(tampered)).toThrow();
    });

    it("throws for an empty string", () => {
      expect(() => tokenService.verifyAccessToken("")).toThrow();
    });
  });

  // ── Refresh tokens ─────────────────────────────────────────────────────────

  describe("signRefreshToken / verifyRefreshToken", () => {
    it("round-trips a valid refresh token", () => {
      const token = tokenService.signRefreshToken(SAMPLE_PAYLOAD);
      expect(token).toBeTypeOf("string");

      const decoded = tokenService.verifyRefreshToken(token);
      expect(decoded.userId).toBe(SAMPLE_PAYLOAD.userId);
      expect(decoded.role).toBe(SAMPLE_PAYLOAD.role);
    });

    it("throws when an access token is passed to verifyRefreshToken (token_use mismatch)", () => {
      const accessToken = tokenService.signAccessToken(SAMPLE_PAYLOAD);
      expect(() => tokenService.verifyRefreshToken(accessToken)).toThrow();
    });

    it("two refresh tokens for same payload differ (jti randomness)", () => {
      const t1 = tokenService.signRefreshToken(SAMPLE_PAYLOAD);
      const t2 = tokenService.signRefreshToken(SAMPLE_PAYLOAD);
      expect(t1).not.toBe(t2);
    });
  });

  // ── hashToken ──────────────────────────────────────────────────────────────

  describe("hashToken", () => {
    it("returns a hex string of length 64 (SHA-256)", () => {
      const hash = tokenService.hashToken("some-token-value");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic — same input always yields same hash", () => {
      const h1 = tokenService.hashToken("deterministic-input");
      const h2 = tokenService.hashToken("deterministic-input");
      expect(h1).toBe(h2);
    });

    it("different inputs produce different hashes", () => {
      const h1 = tokenService.hashToken("tokenA");
      const h2 = tokenService.hashToken("tokenB");
      expect(h1).not.toBe(h2);
    });
  });
});
