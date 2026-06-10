import { RefreshToken } from "@/models/refresh-token";
import { User } from "@/models/user";
import { AppError } from "@/types";
import { AuthTokens, JwtPayload, Role, UserDocument } from "@/types/auth";
import { hashToken, signAccessToken, signRefreshToken } from "@/utils/jwt";
import { validatePasswordStrength } from "@/utils/password";
import { revokeUserTokens } from "@/utils/token-revocation";

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/** Create hashed refresh token in DB, return raw JWT token to caller */
async function createRefreshTokenInDb(userId: string, payload: JwtPayload): Promise<string> {
  const rawToken = signRefreshToken(payload);
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({ token: hashedToken, userId, expiresAt });
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
  if (!user || !user.isActive)
    throw new AppError({
      message: "Invalid email or password!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });

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

/** Rotate refresh token: revoke old, issue new pair */
export async function refresh(rawRefreshToken: string): Promise<AuthTokens> {
  const hashedToken = hashToken(rawRefreshToken);
  const storedToken = await RefreshToken.findOne({ token: hashedToken });

  if (!storedToken) {
    throw new AppError({
      message: "Invalid refresh token!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  // Reuse detection: an already-revoked token presented again means it was
  // rotated already — a sign of theft/replay. Nuke the user's whole token family
  // (all refresh tokens + access tokens) so attacker and user must re-login.
  if (storedToken.isRevoked) {
    await RefreshToken.updateMany({ userId: storedToken.userId }, { isRevoked: true });
    await revokeUserTokens(String(storedToken.userId));
    throw new AppError({
      message: "Refresh token reuse detected — all sessions have been revoked!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  if (storedToken.expiresAt < new Date()) {
    await storedToken.deleteOne();
    throw new AppError({
      message: "Invalid or expired refresh token!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  // Rotate: revoke old token, issue new one
  storedToken.isRevoked = true;
  await storedToken.save();

  const user = await User.findById(storedToken.userId);
  if (!user || !user.isActive)
    throw new AppError({
      message: "User not found or inactive!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });

  const payload = buildPayload(user);
  const accessToken = signAccessToken(payload);
  const newRefreshToken = await createRefreshTokenInDb(user._id.toString(), payload);

  return { accessToken, refreshToken: newRefreshToken };
}

/** Revoke a refresh token (logout) and invalidate the user's access tokens */
export async function logout(rawRefreshToken: string): Promise<void> {
  const hashedToken = hashToken(rawRefreshToken);
  const stored = await RefreshToken.findOneAndUpdate({ token: hashedToken }, { isRevoked: true });

  // Revoke outstanding access tokens for this user (no-op when Redis is off).
  // userId comes from the stored record, so we never trust an unverified token.
  if (stored) {
    await revokeUserTokens(String(stored.userId));
  }
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
