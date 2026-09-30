import { RefreshToken } from "@/models/refresh-token";
import { AppError } from "@/types";
import { hashToken } from "@/utils/jwt";
import * as AuthService from "@/modules/auth/service";

describe("refresh token service contract", () => {
  it("rotates once and serves concurrent retries during the grace window", async () => {
    const { tokens } = await AuthService.register(
      "service-refresh@example.com",
      "StrongPass1!",
      "Service Refresh",
    );

    const rotated = await AuthService.refresh(tokens.refreshToken);
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    const responses = await Promise.all(
      Array.from({ length: 3 }, () => AuthService.refresh(tokens.refreshToken)),
    );
    expect(responses).toHaveLength(3);
    expect(responses.every((response) => response.refreshToken !== tokens.refreshToken)).toBe(true);

    const predecessor = await RefreshToken.findOne({ token: hashToken(tokens.refreshToken) });
    expect(predecessor?.isRevoked).toBe(true);
    expect(predecessor?.rotatedAt).toBeInstanceOf(Date);
    expect(
      await RefreshToken.countDocuments({ familyId: predecessor?.familyId, isRevoked: false }),
    ).toBe(4);
  });

  it("revokes every session when a consumed token is reused after the grace window", async () => {
    const { user, tokens } = await AuthService.register(
      "service-reuse@example.com",
      "StrongPass1!",
      "Service Reuse",
    );
    const rotated = await AuthService.refresh(tokens.refreshToken);
    await RefreshToken.updateOne(
      { token: hashToken(tokens.refreshToken) },
      { $set: { rotatedAt: new Date(Date.now() - 11_000) } },
    );

    await expect(AuthService.refresh(tokens.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
      message: expect.stringMatching(/reuse detected/i),
    } satisfies Partial<AppError>);
    expect(await RefreshToken.countDocuments({ userId: user._id, isRevoked: false })).toBe(0);
    expect(
      await RefreshToken.exists({ token: hashToken(rotated.refreshToken), isRevoked: true }),
    ).not.toBeNull();
  });
});
