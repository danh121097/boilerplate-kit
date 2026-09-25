import { RefreshToken } from "@/models/refresh-token";
import { User } from "@/models/user";
import { register, login, refresh, logout, getMe } from "@/modules/auth/service";
import { AppError } from "@/types";
import { hashToken } from "@/utils/jwt";
import { describe, it, expect } from "vitest";

describe("AuthService", () => {
  const validUser = {
    email: "test@example.com",
    password: "Password1!",
    name: "Test",
  };

  describe("register", () => {
    it("creates user and returns tokens", async () => {
      const result = await register(validUser.email, validUser.password, validUser.name);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      const dbUser = await User.findOne({ email: validUser.email });
      expect(dbUser).toBeTruthy();
    });

    it("throws CONFLICT for duplicate email", async () => {
      await register(validUser.email, validUser.password, validUser.name);
      await expect(register(validUser.email, validUser.password, validUser.name)).rejects.toThrow(
        AppError,
      );
    });

    it("throws VALIDATION_ERROR for weak password", async () => {
      await expect(register("a@b.com", "weak", "Test")).rejects.toThrow(AppError);
    });
  });

  describe("login", () => {
    it("returns tokens for valid credentials", async () => {
      await register(validUser.email, validUser.password, validUser.name);
      const result = await login(validUser.email, validUser.password);
      expect(result.tokens.accessToken).toBeDefined();
    });

    it("throws 401 for wrong password", async () => {
      await register(validUser.email, validUser.password, validUser.name);
      await expect(login(validUser.email, "WrongPass1!")).rejects.toThrow(AppError);
    });

    it("throws 401 for non-existent email", async () => {
      await expect(login("nobody@example.com", "Password1!")).rejects.toThrow(AppError);
    });

    it("throws 401 for inactive user", async () => {
      const { user } = await register(validUser.email, validUser.password, validUser.name);
      await User.findByIdAndUpdate((user as any)._id, { isActive: false });
      await expect(login(validUser.email, validUser.password)).rejects.toThrow(AppError);
    });
  });

  describe("refresh", () => {
    it("rotates tokens successfully", async () => {
      const { tokens } = await register(validUser.email, validUser.password, validUser.name);
      const newTokens = await refresh(tokens.refreshToken);
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);
    });

    it("rejects invalid refresh token", async () => {
      await expect(refresh("invalidtoken")).rejects.toThrow(AppError);
    });

    it("deletes and rejects expired refresh token", async () => {
      const { tokens } = await register(validUser.email, validUser.password, validUser.name);
      // Manually expire the token in DB
      const hashed = hashToken(tokens.refreshToken);
      await RefreshToken.findOneAndUpdate(
        { token: hashed },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      await expect(refresh(tokens.refreshToken)).rejects.toThrow(AppError);
      // Verify token was deleted from DB
      const found = await RefreshToken.findOne({ token: hashed });
      expect(found).toBeNull();
    });

    it("rejects reused (revoked) refresh token", async () => {
      const { tokens } = await register(validUser.email, validUser.password, validUser.name);
      await refresh(tokens.refreshToken);
      await expect(refresh(tokens.refreshToken)).rejects.toThrow(AppError);
    });

    it("on reuse, invalidates the ENTIRE token family (stolen-token defense)", async () => {
      const { user, tokens } = await register(validUser.email, validUser.password, validUser.name);
      // Legit rotation → `tokens.refreshToken` is now revoked, `rotated` is valid.
      const rotated = await refresh(tokens.refreshToken);

      // Replaying the OLD (revoked) token signals theft → reuse detected.
      await expect(refresh(tokens.refreshToken)).rejects.toThrow(AppError);

      // The still-"valid" rotated token is ALSO revoked now (whole family nuked),
      // so both the attacker and the user are forced to log in again.
      await expect(refresh(rotated.refreshToken)).rejects.toThrow(AppError);
      const active = await RefreshToken.countDocuments({
        userId: (user as any)._id,
        isRevoked: false,
      });
      expect(active).toBe(0);
    });

    it("concurrent refreshes with one token: exactly one wins, the rest are reuse", async () => {
      const { user, tokens } = await register(validUser.email, validUser.password, validUser.name);
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => refresh(tokens.refreshToken)),
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);
      for (const r of rejected) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
        expect((r as PromiseRejectedResult).reason.statusCode).toBe(401);
      }
      // The claimed token is revoked exactly once and stays revoked.
      const stored = await RefreshToken.findOne({ token: hashToken(tokens.refreshToken) });
      expect(stored?.isRevoked).toBe(true);
      expect(await RefreshToken.countDocuments({ userId: (user as any)._id })).toBe(2);
    });

    it("rejects a duplicate refresh-token hash (unique index)", async () => {
      await RefreshToken.init();
      const { user, tokens } = await register(validUser.email, validUser.password, validUser.name);
      await expect(
        RefreshToken.create({
          token: hashToken(tokens.refreshToken),
          userId: (user as any)._id,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("throws when user is inactive", async () => {
      const { user, tokens } = await register(validUser.email, validUser.password, validUser.name);
      await User.findByIdAndUpdate((user as any)._id, { isActive: false });
      await expect(refresh(tokens.refreshToken)).rejects.toThrow(AppError);
    });
  });

  describe("logout", () => {
    it("revokes refresh token without error", async () => {
      const { tokens } = await register(validUser.email, validUser.password, validUser.name);
      await expect(logout(tokens.refreshToken)).resolves.toBeUndefined();
    });
  });

  describe("user model pre-save hook", () => {
    it("does not rehash password when other fields change", async () => {
      const { user } = await register(validUser.email, validUser.password, validUser.name);
      const dbUser = await User.findById((user as any)._id).select("+password");
      const originalHash = dbUser!.password;

      dbUser!.name = "Updated Name";
      await dbUser!.save();

      const updated = await User.findById((user as any)._id).select("+password");
      expect(updated!.password).toBe(originalHash);
    });
  });

  describe("getMe", () => {
    it("returns user by ID", async () => {
      const { user } = await register(validUser.email, validUser.password, validUser.name);
      const found = await getMe((user as any)._id.toString());
      expect(found).toBeTruthy();
    });

    it("throws NOT_FOUND for bad ID", async () => {
      await expect(getMe("000000000000000000000000")).rejects.toThrow(AppError);
    });

    it("throws NOT_FOUND for inactive user", async () => {
      const { user } = await register(validUser.email, validUser.password, validUser.name);
      await User.findByIdAndUpdate((user as any)._id, { isActive: false });
      await expect(getMe((user as any)._id.toString())).rejects.toThrow(AppError);
    });
  });
});
