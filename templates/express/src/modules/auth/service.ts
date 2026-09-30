import { User } from "@/models/user";
import { issueTokens } from "@/modules/auth/refresh-session";
import { AppError } from "@/types";
import { AuthTokens, UserDocument } from "@/types/auth";
import { burnDummyPasswordCompare, validatePasswordStrength } from "@/utils/password";

// Refresh-token lifecycle lives in refresh-session.ts; re-exported so callers keep
// a single auth entry point.
export { REFRESH_REUSE_GRACE_MS, logout, refresh } from "@/modules/auth/refresh-session";

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
  return { user, tokens: await issueTokens(user) };
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

  return { user, tokens: await issueTokens(user) };
}

/** Get current user profile by ID */
export async function getMe(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user || !user.isActive)
    throw new AppError({
      message: "User not found!",
      statusCode: 404,
      errorType: "NOT_FOUND",
    });
  return user;
}
