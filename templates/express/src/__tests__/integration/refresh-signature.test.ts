import { RefreshToken } from "@/models/refresh-token";
import { refresh, register } from "@/modules/auth/service";
import { AppError } from "@/types";
import { hashToken } from "@/utils/jwt";
import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

/**
 * The refresh JWT's signature is verified before the hash lookup. Each forged token below
 * has its hash planted in the database, so only the signature check can refuse it.
 */

const creds = { email: "sig@example.com", password: "Password1!", name: "Sig" };

async function signUp() {
  const { user, tokens } = await register(creds.email, creds.password, creds.name);
  return { userId: String((user as { _id: unknown })._id), tokens };
}

/** Store `token` as a live refresh token for the user, as if the server had issued it. */
async function plant(token: string, userId: string): Promise<void> {
  await RefreshToken.create({
    token: hashToken(token),
    userId: new mongoose.Types.ObjectId(userId),
    familyId: "forged-family",
    expiresAt: new Date(Date.now() + 60_000),
  });
}

async function expectGeneric401(token: string): Promise<void> {
  const err = await refresh(token).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({
    message: "Invalid refresh token!",
    statusCode: 401,
    errorType: "AUTHENTICATION_ERROR",
  });
}

describe("refresh token signature", () => {
  it("still rotates a genuine token", async () => {
    const { tokens } = await signUp();
    const next = await refresh(tokens.refreshToken);
    expect(next.refreshToken).not.toBe(tokens.refreshToken);
  });

  it("rejects a tampered signature even when its hash is stored", async () => {
    const { userId, tokens } = await signUp();
    const [header, payload, signature] = tokens.refreshToken.split(".");
    const flipped = signature.startsWith("A") ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    const tampered = [header, payload, flipped].join(".");
    await plant(tampered, userId);

    await expectGeneric401(tampered);
  });

  it("rejects a token signed with another secret even when its hash is stored", async () => {
    const { userId } = await signUp();
    const forged = jwt.sign(
      { userId, token_use: "refresh" },
      "another-secret-of-at-least-32-characters",
      {
        algorithm: "HS256",
        expiresIn: "7d",
      },
    );
    await plant(forged, userId);

    await expectGeneric401(forged);
  });

  it("rejects an expired token even when its hash is stored with a future expiry", async () => {
    const { userId } = await signUp();
    const expired = jwt.sign({ userId, token_use: "refresh" }, process.env.JWT_REFRESH_SECRET!, {
      algorithm: "HS256",
      expiresIn: -60,
    });
    await plant(expired, userId);

    await expectGeneric401(expired);
  });

  it("answers an unknown but well-signed token with the same 401", async () => {
    const { userId } = await signUp();
    const unknown = jwt.sign({ userId, token_use: "refresh" }, process.env.JWT_REFRESH_SECRET!, {
      algorithm: "HS256",
      expiresIn: "7d",
    });
    await expectGeneric401(unknown);
  });

  it("does not revoke the user's sessions when a forged token is presented", async () => {
    const { userId, tokens } = await signUp();
    const forged = jwt.sign({ userId }, "another-secret-of-at-least-32-characters", {
      algorithm: "HS256",
    });
    await expectGeneric401(forged);
    await expect(refresh(tokens.refreshToken)).resolves.toBeDefined();
  });
});
