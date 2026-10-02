import { RefreshToken } from "@/models/refresh-token";
import { User } from "@/models/user";
import {
  register,
  login,
  refresh,
  logout,
  getMe,
  REFRESH_REUSE_GRACE_MS,
} from "@/modules/auth/service";
import { config } from "@/config/environment";
import { AppError } from "@/types";
import { hashToken } from "@/utils/jwt";
import { randomUUID } from "crypto";
import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

/** Pretend a token was rotated `ms` ago (default: just past the reuse grace window). */
async function backdateRotation(
  rawToken: string,
  ms = REFRESH_REUSE_GRACE_MS + 1_000,
): Promise<void> {
  await RefreshToken.updateOne(
    { token: hashToken(rawToken) },
    { rotatedAt: new Date(Date.now() - ms) },
  );
}

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
      await User.findByIdAndUpdate(user._id, { isActive: false });
      await expect(login(validUser.email, validUser.password)).rejects.toThrow(AppError);
    });
  });

  describe("refresh", () => {
    it("rotates tokens successfully", async () => {
      const { tokens } = await register(validUser.email, validUser.password, validUser.name);
      const newTokens = await refresh(tokens.refreshToken);
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);

      const predecessor = await RefreshToken.findOne({ token: hashToken(tokens.refreshToken) });
      expect(predecessor?.isRevoked).toBe(true);
      expect(predecessor?.rotatedAt).toBeInstanceOf(Date);
    });

    describe("refresh JWT verification", () => {
      /**
       * A token the server never signed correctly, but whose hash IS stored (as if an
       * attacker had planted it): only the JWT signature/expiry check can reject it.
       */
      async function storeForged(forge: (real: string) => string): Promise<string> {
        const { user, tokens } = await register(
          validUser.email,
          validUser.password,
          validUser.name,
        );
        const forged = forge(tokens.refreshToken);
        await RefreshToken.create({
          token: hashToken(forged),
          userId: user._id,
          familyId: "forged-family",
          expiresAt: new Date(Date.now() + 60_000),
        });
        return forged;
      }

      /** Same claims as `real`, re-signed with `secret` and the given expiry. */
      const resign = (real: string, secret: string, expiresIn: number): string => {
        const { iat: _iat, exp: _exp, jti: _jti, ...claims } = jwt.decode(real) as jwt.JwtPayload;
        return jwt.sign(claims, secret, {
          algorithm: "HS256",
          expiresIn,
          jwtid: randomUUID(),
        });
      };

      const expectGeneric401 = async (token: string): Promise<void> => {
        const unknown = await refresh("not-a-stored-token").catch((e: unknown) => e as AppError);
        const err = await refresh(token).catch((e: unknown) => e as AppError);
        expect(err).toBeInstanceOf(AppError);
        expect(err).toMatchObject({
          statusCode: 401,
          errorType: "AUTHENTICATION_ERROR",
          message: (unknown as AppError).message,
        });
      };

      it("rejects a tampered signature with the same generic 401 as an unknown token", async () => {
        const forged = await storeForged((real) => {
          const [header, payload, signature] = real.split(".");
          const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
          return `${header}.${payload}.${flipped}`;
        });
        await expectGeneric401(forged);
      });

      it("rejects a token signed with the wrong secret with the same generic 401", async () => {
        const forged = await storeForged((real) =>
          resign(real, `${config.jwtRefreshSecret}-other`, 60),
        );
        await expectGeneric401(forged);
      });

      it("rejects an expired JWT even when its stored record is still live", async () => {
        const forged = await storeForged((real) => resign(real, config.jwtRefreshSecret, -60));
        await expectGeneric401(forged);
      });
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

    it("rejects reused (revoked) refresh token after the grace window", async () => {
      const { tokens } = await register(validUser.email, validUser.password, validUser.name);
      await refresh(tokens.refreshToken);
      await backdateRotation(tokens.refreshToken);
      await expect(refresh(tokens.refreshToken)).rejects.toThrow(AppError);
    });

    it("on reuse, invalidates the ENTIRE token family (stolen-token defense)", async () => {
      const { user, tokens } = await register(validUser.email, validUser.password, validUser.name);
      // Legit rotation → `tokens.refreshToken` is now revoked, `rotated` is valid.
      const rotated = await refresh(tokens.refreshToken);

      // Replaying the OLD (revoked) token after the grace window signals theft.
      await backdateRotation(tokens.refreshToken);
      await expect(refresh(tokens.refreshToken)).rejects.toThrow(AppError);

      // The still-"valid" rotated token is ALSO revoked now (whole family nuked),
      // so both the attacker and the user are forced to log in again.
      await expect(refresh(rotated.refreshToken)).rejects.toThrow(AppError);
      const active = await RefreshToken.countDocuments({
        userId: user._id,
        isRevoked: false,
      });
      expect(active).toBe(0);
    });

    it("rejects a duplicate refresh-token hash (unique index)", async () => {
      await RefreshToken.init();
      const { user, tokens } = await register(validUser.email, validUser.password, validUser.name);
      await expect(
        RefreshToken.create({
          token: hashToken(tokens.refreshToken),
          userId: user._id,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("throws when user is inactive", async () => {
      const { user, tokens } = await register(validUser.email, validUser.password, validUser.name);
      await User.findByIdAndUpdate(user._id, { isActive: false });
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
      const dbUser = await User.findById(user._id).select("+password");
      const originalHash = dbUser!.password;

      dbUser!.name = "Updated Name";
      await dbUser!.save();

      const updated = await User.findById(user._id).select("+password");
      expect(updated!.password).toBe(originalHash);
    });
  });

  describe("getMe", () => {
    it("returns user by ID", async () => {
      const { user } = await register(validUser.email, validUser.password, validUser.name);
      const found = await getMe(String(user._id));
      expect(found).toBeTruthy();
    });

    it("throws NOT_FOUND for bad ID", async () => {
      await expect(getMe("000000000000000000000000")).rejects.toThrow(AppError);
    });

    it("throws NOT_FOUND for inactive user", async () => {
      const { user } = await register(validUser.email, validUser.password, validUser.name);
      await User.findByIdAndUpdate(user._id, { isActive: false });
      await expect(getMe(String(user._id))).rejects.toThrow(AppError);
    });
  });
});
