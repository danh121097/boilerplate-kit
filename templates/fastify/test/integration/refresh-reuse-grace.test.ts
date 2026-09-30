import { RefreshToken } from "@/models/refresh-token";
import { User } from "@/models/user";
import * as AuthService from "@/modules/auth/service";
import {
  REFRESH_REUSE_GRACE_MS,
  issueTokens,
  logout,
  refresh,
} from "@/modules/auth/refresh-session";
import { login, register } from "@/modules/auth/service";
import { AppError } from "@/types";
import { hashToken, verifyAccessToken } from "@/utils/jwt";
import { disconnectUserSockets } from "@/utils/socket-emit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";

vi.mock("@/utils/socket-emit", () => ({ disconnectUserSockets: vi.fn() }));

const creds = { email: "grace@example.com", password: "Password1!", name: "Grace" };

async function signUp() {
  const { user, tokens } = await register(creds.email, creds.password, creds.name);
  return { userId: String((user as { _id: unknown })._id), tokens };
}

const activeCount = (userId: string) =>
  RefreshToken.countDocuments({ userId: new mongoose.Types.ObjectId(userId), isRevoked: false });

const rotatedAgo = (rawToken: string, ms: number) =>
  RefreshToken.updateOne({ token: hashToken(rawToken) }, { rotatedAt: new Date(Date.now() - ms) });

beforeEach(() => vi.mocked(disconnectUserSockets).mockClear());
afterEach(() => vi.useRealTimers());

describe("refresh reuse grace window", () => {
  it("serves a sequential retry inside the window and the first successor still refreshes", async () => {
    const { userId, tokens } = await signUp();
    const first = await refresh(tokens.refreshToken);
    const retry = await refresh(tokens.refreshToken);

    expect(retry.refreshToken).not.toBe(first.refreshToken);
    await expect(refresh(first.refreshToken)).resolves.toBeDefined();
    expect(disconnectUserSockets).not.toHaveBeenCalled();
    expect(await activeCount(userId)).toBeGreaterThan(0);
  });

  it("lets parallel refreshes with one token all succeed without revoking the family", async () => {
    const { userId, tokens } = await signUp();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => refresh(tokens.refreshToken)),
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await activeCount(userId)).toBe(5);
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });

  it("treats reuse after the window as theft: revokes all tokens and drops sockets", async () => {
    const { userId, tokens } = await signUp();
    const rotated = await refresh(tokens.refreshToken);
    await rotatedAgo(tokens.refreshToken, REFRESH_REUSE_GRACE_MS + 1_000);

    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await activeCount(userId)).toBe(0);
    expect(disconnectUserSockets).toHaveBeenCalledWith(userId);
    await expect(refresh(rotated.refreshToken)).rejects.toBeInstanceOf(AppError);
  });

  it("honors the window with fake timers", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { tokens } = await signUp();
    await refresh(tokens.refreshToken);

    vi.setSystemTime(Date.now() + REFRESH_REUSE_GRACE_MS - 1);
    await expect(refresh(tokens.refreshToken)).resolves.toBeDefined();

    vi.setSystemTime(Date.now() + REFRESH_REUSE_GRACE_MS + 1);
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("does not resurrect a nuked family when a recently rotated token is replayed", async () => {
    const { userId, tokens } = await signUp();
    const second = await refresh(tokens.refreshToken);
    const third = await refresh(second.refreshToken);
    // Old token replayed after the window nukes the family...
    await rotatedAgo(tokens.refreshToken, REFRESH_REUSE_GRACE_MS + 1_000);
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });

    // ...and `second` was rotated moments ago, but its rotatedAt was cleared.
    await expect(refresh(second.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    await expect(refresh(third.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await activeCount(userId)).toBe(0);
    expect(await RefreshToken.countDocuments({ rotatedAt: { $exists: true } })).toBe(0);
  });

  it("does not grace a token revoked by logout", async () => {
    const { userId, tokens } = await signUp();
    await logout(tokens.refreshToken);
    expect(disconnectUserSockets).toHaveBeenCalledWith(userId);
    vi.mocked(disconnectUserSockets).mockClear();

    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(disconnectUserSockets).toHaveBeenCalledWith(userId);
  });

  it("does not grace a rotated token that has since expired", async () => {
    const { tokens } = await signUp();
    await refresh(tokens.refreshToken);
    await RefreshToken.updateOne(
      { token: hashToken(tokens.refreshToken) },
      { expiresAt: new Date(Date.now() - 1_000) },
    );
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refuses a graced retry when the user was deactivated", async () => {
    const { userId, tokens } = await signUp();
    await refresh(tokens.refreshToken);
    await User.findByIdAndUpdate(userId, { isActive: false });
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("logout ends the whole session chain", () => {
  it("a graced predecessor cannot resurrect a session after logout", async () => {
    const { tokens: a } = await signUp();
    const b = await refresh(a.refreshToken);
    await logout(b.refreshToken);

    // A was rotated moments ago, but logout revoked its family and cleared rotatedAt.
    await expect(refresh(a.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("keeps the user's other device (family) logged in", async () => {
    const { tokens: a } = await signUp();
    const other = await login(creds.email, creds.password);
    const b = await refresh(a.refreshToken);
    await logout(b.refreshToken);

    await expect(refresh(other.tokens.refreshToken)).resolves.toBeDefined();
  });

  it("inherits the familyId across rotations and graced re-issues", async () => {
    const { tokens } = await signUp();
    const first = await refresh(tokens.refreshToken);
    const retry = await refresh(tokens.refreshToken);
    const ids = await Promise.all(
      [tokens.refreshToken, first.refreshToken, retry.refreshToken].map(
        async (t) => (await RefreshToken.findOne({ token: hashToken(t) }))!.familyId,
      ),
    );
    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size).toBe(1);
  });

  it("legacy tokens without familyId: logout revokes only the presented token", async () => {
    const { tokens } = await signUp();
    await RefreshToken.collection.updateMany({}, { $unset: { familyId: 1 } });
    const other = await login(creds.email, creds.password);
    await logout(tokens.refreshToken);

    const stored = await RefreshToken.findOne({ token: hashToken(tokens.refreshToken) });
    expect(stored!.isRevoked).toBe(true);
    await expect(refresh(other.tokens.refreshToken)).resolves.toBeDefined();
  });
});

describe("revoke racing a refresh", () => {
  /** Run `revoke` after the claim/grace check but before the new token is inserted. */
  const interleave = (revoke: () => Promise<unknown>) => {
    const original = RefreshToken.create.bind(RefreshToken);
    return vi.spyOn(RefreshToken, "create").mockImplementationOnce((async (...args: unknown[]) => {
      await revoke();
      return (original as (...a: unknown[]) => unknown)(...args);
    }) as never);
  };

  afterEach(() => vi.restoreAllMocks());

  it("normal rotation: a logout landing before the insert leaves no live token", async () => {
    const { tokens: a } = await signUp();
    interleave(() => logout(a.refreshToken));

    await expect(refresh(a.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("graced retry: a logout landing before the insert leaves no live token", async () => {
    const { tokens: a } = await signUp();
    const b = await refresh(a.refreshToken);
    interleave(() => logout(b.refreshToken));

    await expect(refresh(a.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("graced retry: a user-wide reuse revoke before the insert leaves no live token", async () => {
    const { userId, tokens: a } = await signUp();
    await refresh(a.refreshToken);
    interleave(() =>
      RefreshToken.updateMany(
        { userId: new mongoose.Types.ObjectId(userId) },
        { $set: { isRevoked: true }, $unset: { rotatedAt: 1 } },
      ),
    );

    await expect(refresh(a.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await activeCount(userId)).toBe(0);
  });

  it("a revoke landing between the insert and the re-check leaves no live token", async () => {
    const { tokens: a } = await signUp();
    const b = await refresh(a.refreshToken);
    const original = RefreshToken.exists.bind(RefreshToken);
    vi.spyOn(RefreshToken, "exists").mockImplementationOnce((async (...args: unknown[]) => {
      await logout(b.refreshToken);
      return (original as (...x: unknown[]) => unknown)(...args);
    }) as never);

    await expect(refresh(a.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("a revoke landing after the re-check still covers the new token", async () => {
    const { tokens: a } = await signUp();
    const b = await refresh(a.refreshToken);
    await logout(b.refreshToken);
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("does not disturb another family when only one is revoked mid-refresh", async () => {
    const { tokens: a } = await signUp();
    const other = await login(creds.email, creds.password);
    interleave(() => logout(a.refreshToken));

    await expect(refresh(a.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    await expect(refresh(other.tokens.refreshToken)).resolves.toBeDefined();
  });
});

describe("logout without a known token", () => {
  it("does not touch sockets for an unknown refresh token", async () => {
    await logout("not-a-stored-token");
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });
});

describe("refresh token lifetime", () => {
  it("sets expiresAt from JWT_REFRESH_EXPIRY", async () => {
    const { config } = await import("@/config/environment");
    const original = config.jwtRefreshExpiry;
    config.jwtRefreshExpiry = "1h";
    try {
      const { tokens } = await signUp();
      const stored = await RefreshToken.findOne({ token: hashToken(tokens.refreshToken) });
      const ttlMs = stored!.expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(3_500_000);
      expect(ttlMs).toBeLessThanOrEqual(3_600_000);
    } finally {
      config.jwtRefreshExpiry = original;
    }
  });
});

describe("login timing equalization", () => {
  it("runs a bcrypt compare for unknown and inactive users before the 401", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    try {
      await expect(login("nobody@example.com", "Password1!")).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid email or password!",
      });
      expect(compare).toHaveBeenCalledTimes(1);

      const { userId } = await signUp();
      await User.findByIdAndUpdate(userId, { isActive: false });
      compare.mockClear();
      await expect(login(creds.email, creds.password)).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid email or password!",
      });
      expect(compare).toHaveBeenCalledTimes(1);
    } finally {
      compare.mockRestore();
    }
  });
});

describe("refresh-session module", () => {
  it("is re-exported unchanged by the auth service entry point", () => {
    expect(AuthService.refresh).toBe(refresh);
    expect(AuthService.logout).toBe(logout);
    expect(AuthService.REFRESH_REUSE_GRACE_MS).toBe(REFRESH_REUSE_GRACE_MS);
  });

  describe("issueTokens", () => {
    const account = {
      _id: new mongoose.Types.ObjectId(),
      email: "issue@example.com",
      role: "admin" as const,
    };

    it("signs an access token for the user and stores only the refresh token hash", async () => {
      const tokens = await issueTokens(account);

      expect(verifyAccessToken(tokens.accessToken)).toMatchObject({
        userId: String(account._id),
        email: account.email,
        role: "admin",
      });
      const stored = await RefreshToken.findOne({ userId: account._id });
      expect(stored!.token).toBe(hashToken(tokens.refreshToken));
      expect(stored!.token).not.toBe(tokens.refreshToken);
      expect(stored!.isRevoked).toBe(false);
      expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("starts a fresh family per session and keeps a given family", async () => {
      const first = await issueTokens(account);
      const second = await issueTokens(account);
      const familyId = "family-under-test";
      const inherited = await issueTokens(account, familyId);

      const familyOf = async (t: { refreshToken: string }) =>
        (await RefreshToken.findOne({ token: hashToken(t.refreshToken) }))!.familyId;
      const [a, b, c] = await Promise.all([first, second, inherited].map(familyOf));
      expect(a).toBeTruthy();
      expect(a).not.toBe(b);
      expect(c).toBe(familyId);
    });
  });
});
