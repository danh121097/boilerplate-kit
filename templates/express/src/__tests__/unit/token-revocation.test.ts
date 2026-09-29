import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Token revocation must no-op when Redis is off, set/read the per-user cutoff
 * when on, fail open on errors, and the auth middleware must reject access tokens
 * issued before that cutoff.
 */

const getRedisMock = vi.fn();
vi.mock("@/config/redis", () => ({ getRedis: () => getRedisMock() }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetModules());

describe("revocation helpers — disabled", () => {
  it("revokeUserTokens is a no-op and getUserRevokedAt returns null", async () => {
    getRedisMock.mockReturnValue(null);
    const { revokeUserTokens, getUserRevokedAt } = await import("@/utils/token-revocation");

    await expect(revokeUserTokens("u1")).resolves.toBeUndefined();
    expect(await getUserRevokedAt("u1")).toBeNull();
  });
});

describe("revocation helpers — enabled", () => {
  it("sets the cutoff with a TTL and reads it back", async () => {
    const store = new Map<string, string>();
    const setSpy = vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    });
    getRedisMock.mockReturnValue({
      status: "ready",
      set: setSpy,
      get: vi.fn(async (k: string) => store.get(k) ?? null),
    });
    const { revokeUserTokens, getUserRevokedAt } = await import("@/utils/token-revocation");

    await revokeUserTokens("u1");
    expect(setSpy).toHaveBeenCalledWith("revoked:user:u1", expect.any(String), "EX", 15 * 60);
    expect(await getUserRevokedAt("u1")).toBeTypeOf("number");
  });

  it("fails open when the client throws", async () => {
    getRedisMock.mockReturnValue({
      status: "ready",
      set: vi.fn(async () => {
        throw new Error("down");
      }),
      get: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    const { revokeUserTokens, getUserRevokedAt } = await import("@/utils/token-revocation");

    await expect(revokeUserTokens("u1")).resolves.toBeUndefined();
    expect(await getUserRevokedAt("u1")).toBeNull();
  });
});

describe("revocation helpers — Redis not ready", () => {
  it("skips the write and fails open on read without touching the client", async () => {
    const set = vi.fn();
    const get = vi.fn();
    getRedisMock.mockReturnValue({ status: "reconnecting", set, get });
    const { revokeUserTokens, getUserRevokedAt } = await import("@/utils/token-revocation");

    const started = Date.now();
    await revokeUserTokens("u1");
    expect(await getUserRevokedAt("u1")).toBeNull();
    expect(Date.now() - started).toBeLessThan(100);
    expect(set).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("revocation cutoff precision", () => {
  it("stores milliseconds and scales legacy second-precision cutoffs", async () => {
    const store = new Map<string, string>();
    getRedisMock.mockReturnValue({
      status: "ready",
      set: vi.fn(async (k: string, v: string) => store.set(k, v)),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
    });
    const { revokeUserTokens, getUserRevokedAt } = await import("@/utils/token-revocation");

    await revokeUserTokens("u1");
    expect(Number(store.get("revoked:user:u1"))).toBeGreaterThan(1e12);
    store.set("revoked:user:legacy", "1700000000");
    expect(await getUserRevokedAt("legacy")).toBe(1_700_000_000_000);
  });

  it("rejects same-second tokens issued before the cutoff, accepts those issued after", async () => {
    const { isAccessTokenRevoked } = await import("@/utils/token-revocation");
    const { signAccessToken, verifyAccessToken } = await import("@/utils/jwt");
    const payload = { userId: "1", email: "a@b.com", role: "user" as const };

    const before = verifyAccessToken(signAccessToken(payload));
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    const after = verifyAccessToken(signAccessToken(payload));

    // Same wall-clock second as the cutoff, so second-precision `iat` cannot tell them apart.
    expect(Math.floor((before as { iat?: number }).iat!)).toBeLessThanOrEqual(
      Math.floor(cutoff / 1000),
    );
    expect(isAccessTokenRevoked(before as never, cutoff)).toBe(true);
    expect(isAccessTokenRevoked(after as never, cutoff)).toBe(false);
  });

  it("falls back to iat (seconds) for tokens without iat_ms, and never revokes without a cutoff", async () => {
    const { isAccessTokenRevoked } = await import("@/utils/token-revocation");
    expect(isAccessTokenRevoked({ iat: 1000 }, 1_500_000)).toBe(true);
    expect(isAccessTokenRevoked({ iat: 2000 }, 1_500_000)).toBe(false);
    expect(isAccessTokenRevoked({ iat: 1000, iat_ms: 5 }, null)).toBe(false);
  });
});

describe("authenticate — revocation check", () => {
  it("rejects a token issued before the revoke cutoff", async () => {
    // Cutoff is in the future relative to the token iat → revoked.
    const future = Date.now() + 3_600_000;
    getRedisMock.mockReturnValue({
      status: "ready",
      get: vi.fn(async () => String(future)),
    });
    const { authenticate } = await import("@/middleware/auth");
    const { signAccessToken } = await import("@/utils/jwt");
    const { AppError } = await import("@/types");

    const token = signAccessToken({
      userId: "1",
      email: "a@b.com",
      role: "user",
    });
    const req = { headers: { authorization: `Bearer ${token}` } } as any;

    await expect(authenticate(req, {} as any, vi.fn())).rejects.toThrow(AppError);
  });

  it("allows a token issued after the revoke cutoff", async () => {
    const past = Date.now() - 3_600_000;
    getRedisMock.mockReturnValue({
      status: "ready",
      get: vi.fn(async () => String(past)),
    });
    const { authenticate } = await import("@/middleware/auth");
    const { signAccessToken } = await import("@/utils/jwt");

    const token = signAccessToken({
      userId: "1",
      email: "a@b.com",
      role: "user",
    });
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const next = vi.fn();

    await authenticate(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.userId).toBe("1");
  });
});
