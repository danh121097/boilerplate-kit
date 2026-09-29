import { RefreshToken } from "@/models/refresh-token";
import { User } from "@/models/user";
import { AppError } from "@/types";
import { AuthTokens, JwtPayload, RefreshTokenDocument, Role, UserDocument } from "@/types/auth";
import { hashToken, signAccessToken, signRefreshToken } from "@/utils/jwt";
import { burnDummyPasswordCompare, validatePasswordStrength } from "@/utils/password";
import { disconnectUserSockets } from "@/utils/socket-emit";
import { refreshTtlSeconds } from "@/utils/token-lifetimes";
import { revokeUserTokens } from "@/utils/token-revocation";
import { randomUUID } from "crypto";

/**
 * A rotated refresh token may be presented again for this long after rotation
 * without being treated as theft. Covers a lost response, a client retry, and
 * parallel requests from several tabs racing on one token.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Create hashed refresh token in DB, return raw JWT token to caller. A new session
 * (register/login) starts a fresh `familyId`; rotations and graced re-issues pass the
 * predecessor's so logout can end the whole chain.
 */
async function createRefreshTokenInDb(
  userId: string,
  payload: JwtPayload,
  familyId: string = randomUUID(),
): Promise<string> {
  const rawToken = signRefreshToken(payload);
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + refreshTtlSeconds() * 1000);

  await RefreshToken.create({ token: hashedToken, userId, familyId, expiresAt });
  return rawToken;
}

/** Build JWT payload from user document */
function buildPayload(user: { _id: unknown; email: string; role: Role }): JwtPayload {
  return {
    userId: String(user._id),
    email: user.email,
    role: user.role,
  };
}

/** Register a new user and return tokens */
export async function register(
  email: string,
  password: string,
  name: string,
): Promise<{ user: UserDocument; tokens: AuthTokens }> {
  validatePasswordStrength(password);

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser)
    throw new AppError({
      message: "Email already registered!",
      statusCode: 409,
      errorType: "CONFLICT",
    });

  const user = await User.create({ email, password, name });
  const payload = buildPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = await createRefreshTokenInDb(user._id.toString(), payload);

  return { user, tokens: { accessToken, refreshToken } };
}

/** Authenticate user by email/password and return tokens */
export async function login(
  email: string,
  password: string,
): Promise<{ user: UserDocument; tokens: AuthTokens }> {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !user.isActive) {
    await burnDummyPasswordCompare(password);
    throw new AppError({
      message: "Invalid email or password!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch)
    throw new AppError({
      message: "Invalid email or password!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });

  const payload = buildPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = await createRefreshTokenInDb(user._id.toString(), payload);

  return { user, tokens: { accessToken, refreshToken } };
}

/**
 * Classify a refresh token that could not be claimed. Returns the stored token
 * when it is a benign retry/race (rotated moments ago, still unexpired) so the
 * caller issues a fresh pair; throws the matching 401 otherwise.
 *
 * Any other reuse of an already-revoked token is a sign of theft/replay: nuke the
 * user's whole token family (all refresh tokens + access tokens + sockets) so
 * attacker and user must re-login. `rotatedAt` is cleared on every token in the
 * same write so a later graced replay cannot resurrect a revoked family.
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

  const payload = buildPayload(user);
  const accessToken = signAccessToken(payload);
  const newRefreshToken = await createRefreshTokenInDb(
    user._id.toString(),
    payload,
    storedToken.familyId,
  );

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Logout: end this device's whole session chain (every token of the presented
 * token's family, clearing `rotatedAt` so a graced predecessor cannot resurrect it),
 * invalidate the user's access tokens and drop their sockets. Other families (other
 * devices) stay logged in. Tokens issued before families existed fall back to
 * revoking just the presented token.
 */
export async function logout(rawRefreshToken: string): Promise<void> {
  const stored = await RefreshToken.findOne({ token: hashToken(rawRefreshToken) });
  if (!stored) return;

  const filter = stored.familyId ? { familyId: stored.familyId } : { _id: stored._id };
  await RefreshToken.updateMany(filter, { $set: { isRevoked: true }, $unset: { rotatedAt: 1 } });

  // userId comes from the stored record, so we never trust an unverified token.
  const userId = String(stored.userId);
  // Revoke outstanding access tokens for this user (no-op when Redis is off).
  await revokeUserTokens(userId);
  disconnectUserSockets(userId);
}

/** Get current user profile by ID */
export async function getMe(userId: string): Promise<unknown> {
  const user = await User.findById(userId);
  if (!user || !user.isActive)
    throw new AppError({
      message: "User not found!",
      statusCode: 404,
      errorType: "NOT_FOUND",
    });
  return user;
}
