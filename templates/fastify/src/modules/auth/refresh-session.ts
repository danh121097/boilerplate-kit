import { RefreshToken } from "@/models/refresh-token";
import { User } from "@/models/user";
import { AppError } from "@/types";
import { AuthTokens, JwtPayload, RefreshTokenDocument, Role } from "@/types/auth";
import { hashToken, signAccessToken, signRefreshToken } from "@/utils/jwt";
import { disconnectUserSockets } from "@/utils/socket-emit";
import { refreshTtlSeconds } from "@/utils/token-lifetimes";
import { revokeUserTokens } from "@/utils/token-revocation";
import { randomUUID } from "crypto";
import type { Types } from "mongoose";

/**
 * A rotated refresh token may be presented again for this long after rotation
 * without being treated as theft. Covers a lost response, a client retry, and
 * parallel requests from several tabs racing on one token.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Sign an access token and persist a new hashed refresh token for the user. A new
 * session (register/login) starts a fresh `familyId`; rotations and graced re-issues
 * pass the predecessor's so logout can end the whole chain.
 */
export async function issueTokens(
  user: { _id: Types.ObjectId; email: string; role: Role },
  familyId: string = randomUUID(),
): Promise<AuthTokens> {
  const payload: JwtPayload = { userId: user._id.toString(), email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const expiresAt = new Date(Date.now() + refreshTtlSeconds() * 1000);

  await RefreshToken.create({
    token: hashToken(refreshToken),
    userId: payload.userId,
    familyId,
    expiresAt,
  });
  return { accessToken, refreshToken };
}

/**
 * Classify a refresh token that could not be claimed. Returns the stored token
 * when it is a benign retry/race (rotated moments ago, still unexpired) so the
 * caller issues a fresh pair; throws the matching 401 otherwise.
 *
 * Any other reuse of an already-revoked token is a sign of theft/replay: revoke
 * every refresh token of the user (all families, so all devices) plus their access
 * tokens and sockets, so attacker and user must re-login. `rotatedAt` is cleared on
 * every token in the same write so a later graced replay cannot resurrect a revoked
 * session.
 */
async function classifyUnclaimableToken(hashedToken: string): Promise<RefreshTokenDocument> {
  const storedToken = await RefreshToken.findOne({ token: hashedToken });

  if (!storedToken) {
    throw new AppError({
      message: "Invalid refresh token!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  if (storedToken.isRevoked) {
    const now = Date.now();
    const withinGrace =
      storedToken.rotatedAt !== undefined &&
      now - storedToken.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_MS &&
      storedToken.expiresAt.getTime() > now;
    if (withinGrace) return storedToken;

    const userId = String(storedToken.userId);
    await RefreshToken.updateMany(
      { userId: storedToken.userId },
      { $set: { isRevoked: true }, $unset: { rotatedAt: 1 } },
    );
    await revokeUserTokens(userId);
    disconnectUserSockets(userId);
    throw new AppError({
      message: "Refresh token reuse detected — all sessions have been revoked!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  // Not revoked but unclaimable → expired.
  await storedToken.deleteOne();
  throw new AppError({
    message: "Invalid or expired refresh token!",
    statusCode: 401,
    errorType: "AUTHENTICATION_ERROR",
  });
}

/**
 * Rotate refresh token: atomically claim (revoke) the old one, issue a new pair.
 * The claim is a single findOneAndUpdate on {token, not revoked, not expired},
 * so concurrent refreshes with the same token yield exactly one winner. Losers
 * inside the reuse grace window still get a fresh pair (see classifyUnclaimableToken).
 */
export async function refresh(rawRefreshToken: string): Promise<AuthTokens> {
  const hashedToken = hashToken(rawRefreshToken);
  const claimed = await RefreshToken.findOneAndUpdate(
    { token: hashedToken, isRevoked: false, expiresAt: { $gt: new Date() } },
    { isRevoked: true, rotatedAt: new Date() },
  );
  const storedToken = claimed ?? (await classifyUnclaimableToken(hashedToken));

  const user = await User.findById(storedToken.userId);
  if (!user || !user.isActive)
    throw new AppError({
      message: "User not found or inactive!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });

  const tokens = await issueTokens(user, storedToken.familyId);

  // A family/user revoke that ran between the claim (or grace check) and the insert
  // above missed the new token. A logout deletes the predecessor and a reuse revoke
  // $unsets its `rotatedAt` (both claim and graced retry require it to be set).
  // Predecessor gone or no longer carrying it => revoked meanwhile: kill the new
  // token and refuse.
  const stillValid = await RefreshToken.exists({
    _id: storedToken._id,
    rotatedAt: { $exists: true },
  });
  if (!stillValid) {
    await RefreshToken.updateOne({ token: hashToken(tokens.refreshToken) }, { isRevoked: true });
    throw new AppError({
      message: "Refresh token revoked!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  return tokens;
}

/**
 * Logout: end this device's whole session chain by deleting every token of the
 * presented token's family, invalidate the user's access tokens and drop their
 * sockets. Deleting (not flagging revoked) means a later replay of any token in the
 * chain is simply unknown (plain 401) instead of looking like reuse of a revoked
 * token, which would revoke the user's other devices. Other families (other devices)
 * stay logged in. Tokens issued before families existed fall back to deleting just
 * the presented token.
 */
export async function logout(rawRefreshToken: string): Promise<void> {
  const stored = await RefreshToken.findOne({ token: hashToken(rawRefreshToken) });
  if (!stored) return;

  const filter = stored.familyId ? { familyId: stored.familyId } : { _id: stored._id };
  await RefreshToken.deleteMany(filter);

  // userId comes from the stored record, so we never trust an unverified token.
  const userId = String(stored.userId);
  // Revoke outstanding access tokens for this user (no-op when Redis is off).
  await revokeUserTokens(userId);
  disconnectUserSockets(userId);
}
