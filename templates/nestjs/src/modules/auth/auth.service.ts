import { AppException } from "@/common/exceptions/app.exception";
import { TokenRevocationService } from "@/common/services/token-revocation.service";
import { TokenService } from "@/common/services/token.service";
import { AuthTokens, JwtPayload, Role } from "@/common/types/auth.types";
import { PasswordService } from "@/modules/auth/password.service";
import { RefreshToken, RefreshTokenDocument } from "@/schemas/refresh-token.schema";
import { User, UserDocument } from "@/schemas/user.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Auth service — ports express modules/auth/service.ts verbatim.
 *
 * Key behaviors preserved:
 *  - register: strength check → uniqueness check → create user → issue tokens
 *  - login: no enumeration (inactive user == wrong password, same message)
 *  - refresh: DB hash lookup (NOT signature verify on hot path) → atomic claim
 *    (single winner under concurrency) → reuse detection / expiry → new pair
 *  - logout: revoke refresh by hash → revokeUserTokens (no-op when Redis off)
 *  - getMe: find by id, throw 404 if missing/inactive
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly tokenService: TokenService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly passwordService: PasswordService,
  ) {}

  /** Register a new user and return tokens. */
  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    this.passwordService.validatePasswordStrength(password);

    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppException({
        message: "Email already registered!",
        statusCode: 409,
        errorType: "CONFLICT",
      });
    }

    const user = await this.userModel.create({ email, password, name });
    const payload = this.buildPayload(user);
    const accessToken = this.tokenService.signAccessToken(payload);
    const refreshToken = await this.createRefreshTokenInDb(user._id.toString(), payload);

    return { user, tokens: { accessToken, refreshToken } };
  }

  /** Authenticate by email/password — no enumeration (inactive == wrong password). */
  async login(
    email: string,
    password: string,
  ): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select("+password");

    if (!user || !user.isActive) {
      throw new AppException({
        message: "Invalid email or password!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppException({
        message: "Invalid email or password!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    const payload = this.buildPayload(user);
    const accessToken = this.tokenService.signAccessToken(payload);
    const refreshToken = await this.createRefreshTokenInDb(user._id.toString(), payload);

    return { user, tokens: { accessToken, refreshToken } };
  }

  /**
   * Rotate refresh token — atomic claim + reuse detection + expiry + rotation.
   *
   *  1. Hash raw token → atomically claim it: findOneAndUpdate on
   *     {token, isRevoked:false, expiresAt > now} → isRevoked:true. Exactly one
   *     concurrent caller can win; the rest see null.
   *  2. Claim failed → re-lookup to classify:
   *       no record   → 401 invalid
   *       isRevoked   → reuse/theft: revoke ALL user refresh tokens +
   *                     revokeUserTokens (access) → 401
   *       expired     → deleteOne → 401
   *  3. Claim won → find user, issue new pair.
   */
  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const hashedToken = this.tokenService.hashToken(rawRefreshToken);
    const claimedToken = await this.refreshTokenModel.findOneAndUpdate(
      { token: hashedToken, isRevoked: false, expiresAt: { $gt: new Date() } },
      { isRevoked: true },
    );

    if (!claimedToken) return this.rejectUnclaimableToken(hashedToken);

    const user = await this.userModel.findById(claimedToken.userId);
    if (!user || !user.isActive) {
      throw new AppException({
        message: "User not found or inactive!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    const payload = this.buildPayload(user);
    const accessToken = this.tokenService.signAccessToken(payload);
    const newRefreshToken = await this.createRefreshTokenInDb(user._id.toString(), payload);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout — revoke refresh token by hash, then revoke user access tokens.
   * Graceful when no token provided (cookie clients that cleared cookie before call).
   * userId sourced from the DB record (never the unverified raw token).
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const hashedToken = this.tokenService.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenModel.findOneAndUpdate(
      { token: hashedToken },
      { isRevoked: true },
    );

    // Revoke outstanding access tokens (no-op when Redis is disabled).
    if (stored) {
      await this.tokenRevocationService.revokeUserTokens(String(stored.userId));
    }
  }

  /** Get current user profile — 404 if not found or inactive. */
  async getMe(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user || !user.isActive) {
      throw new AppException({
        message: "User not found!",
        statusCode: 404,
        errorType: "NOT_FOUND",
      });
    }
    return user;
  }

  /**
   * Classify a refresh token that could not be claimed and throw the matching
   * 401. Reuse of an already-rotated token revokes the user's whole token family
   * (theft/replay defense: attacker and user must both re-login).
   */
  private async rejectUnclaimableToken(hashedToken: string): Promise<never> {
    const storedToken = await this.refreshTokenModel.findOne({ token: hashedToken });

    if (!storedToken) {
      throw new AppException({
        message: "Invalid refresh token!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    if (storedToken.isRevoked) {
      await this.refreshTokenModel.updateMany(
        { userId: storedToken.userId },
        { isRevoked: true },
      );
      await this.tokenRevocationService.revokeUserTokens(String(storedToken.userId));
      throw new AppException({
        message: "Refresh token reuse detected — all sessions have been revoked!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    // Not revoked but unclaimable → expired.
    await storedToken.deleteOne();
    throw new AppException({
      message: "Invalid or expired refresh token!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  /** Build JWT payload from user document — userId as string, email, role. */
  private buildPayload(user: { _id: Types.ObjectId; email: string; role: Role }): JwtPayload {
    return {
      userId: String(user._id),
      email: user.email,
      role: user.role,
    };
  }

  /** Create hashed refresh token record in DB; return the raw JWT to caller. */
  private async createRefreshTokenInDb(userId: string, payload: JwtPayload): Promise<string> {
    const rawToken = this.tokenService.signRefreshToken(payload);
    const hashedToken = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await this.refreshTokenModel.create({ token: hashedToken, userId, expiresAt });
    return rawToken;
  }
}
