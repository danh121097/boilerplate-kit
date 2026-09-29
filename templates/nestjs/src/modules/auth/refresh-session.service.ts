import { AppException } from "@/common/exceptions/app.exception";
import { TokenRevocationService } from "@/common/services/token-revocation.service";
import { TokenService } from "@/common/services/token.service";
import { AuthTokens, JwtPayload, Role } from "@/common/types/auth.types";
import { AppConfigService } from "@/config/app-config.service";
import { SocketEmitService } from "@/modules/realtime/socket-emit.service";
import { RefreshToken, RefreshTokenDocument } from "@/schemas/refresh-token.schema";
import { User, UserDocument } from "@/schemas/user.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { randomUUID } from "crypto";
import { Model, Types } from "mongoose";

/**
 * How long after a rotation the consumed refresh token is still accepted as a
 * benign retry (network retry, parallel tabs) instead of theft. Within the window
 * the caller gets a fresh pair; after it, reuse revokes every session of the user.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Refresh-token lifecycle: issue, rotate (atomic claim + reuse grace window +
 * reuse detection) and revoke on logout. Auth-facing wrapper is AuthService.
 */
@Injectable()
export class RefreshSessionService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly tokenService: TokenService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly socketEmit: SocketEmitService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Sign an access token and persist a new hashed refresh token for the user.
   * register/login start a new family; rotations and graced re-issues pass the
   * predecessor's so logout can end the whole chain.
   */
  async issueTokens(
    user: { _id: Types.ObjectId; email: string; role: Role },
    familyId: string = randomUUID(),
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { userId: String(user._id), email: user.email, role: user.role };
    const accessToken = this.tokenService.signAccessToken(payload);
    const rawToken = this.tokenService.signRefreshToken(payload);
    const expiresAt = new Date(Date.now() + this.config.jwtRefreshTtlSeconds * 1000);

    await this.refreshTokenModel.create({
      token: this.tokenService.hashToken(rawToken),
      userId: user._id,
      familyId,
      expiresAt,
    });
    return { accessToken, refreshToken: rawToken };
  }

  /**
   * Rotate a refresh token.
   *
   *  1. Hash the raw token and atomically claim it: findOneAndUpdate on
   *     {token, isRevoked:false, expiresAt > now} → {isRevoked:true, rotatedAt:now}.
   *     Exactly one concurrent caller wins.
   *  2. Claim failed → classify (see resolveUnclaimableToken).
   *  3. Claim won → issue a new pair for the active user.
   */
  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const hashedToken = this.tokenService.hashToken(rawRefreshToken);
    const claimedToken = await this.refreshTokenModel.findOneAndUpdate(
      { token: hashedToken, isRevoked: false, expiresAt: { $gt: new Date() } },
      { isRevoked: true, rotatedAt: new Date() },
    );

    if (!claimedToken) return this.resolveUnclaimableToken(hashedToken);
    return this.issueForActiveUser(claimedToken.userId, claimedToken.familyId);
  }

  /**
   * Logout — end this device's whole session chain: revoke every token of the
   * presented token's family and clear their rotatedAt, so a graced predecessor
   * cannot resurrect it. Other families (other devices) stay logged in; legacy
   * tokens without a familyId revoke only themselves. Then revoke the user's
   * access tokens and disconnect their sockets. Graceful when the token is
   * unknown. The user id comes from the DB record, never the raw token.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const stored = await this.refreshTokenModel.findOne({
      token: this.tokenService.hashToken(rawRefreshToken),
    });
    if (!stored) return;

    const filter = stored.familyId ? { familyId: stored.familyId } : { _id: stored._id };
    await this.refreshTokenModel.updateMany(filter, {
      $set: { isRevoked: true },
      $unset: { rotatedAt: 1 },
    });

    const userId = String(stored.userId);
    await this.tokenRevocationService.revokeUserTokens(userId);
    this.socketEmit.disconnectUser(userId);
  }

  /**
   * Classify a refresh token that could not be claimed:
   *   no record                        → 401 invalid
   *   revoked by a rotation ≤ grace    → benign retry: issue a fresh pair (no revoke)
   *   revoked otherwise                → reuse/theft: revoke the whole family → 401
   *   not revoked (so expired)         → deleteOne → 401
   */
  private async resolveUnclaimableToken(hashedToken: string): Promise<AuthTokens> {
    const storedToken = await this.refreshTokenModel.findOne({ token: hashedToken });

    if (!storedToken) {
      throw new AppException({
        message: "Invalid refresh token!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    if (storedToken.isRevoked) {
      if (this.isWithinReuseGrace(storedToken)) {
        return this.issueForActiveUser(storedToken.userId, storedToken.familyId);
      }
      await this.revokeFamily(storedToken.userId);
      throw new AppException({
        message: "Refresh token reuse detected — all sessions have been revoked!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    await storedToken.deleteOne();
    throw new AppException({
      message: "Invalid or expired refresh token!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  /** Rotated (not logged-out) token, unexpired, replayed inside the grace window. */
  private isWithinReuseGrace(token: { rotatedAt?: Date; expiresAt: Date }): boolean {
    if (!token.rotatedAt) return false;
    const now = Date.now();
    return (
      now - token.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_MS && token.expiresAt.getTime() > now
    );
  }

  /**
   * Revoke every refresh token of the user, clear rotatedAt so a graced replay
   * cannot resurrect the family, then revoke access tokens and drop sockets.
   */
  private async revokeFamily(userId: Types.ObjectId): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { userId },
      { $set: { isRevoked: true }, $unset: { rotatedAt: 1 } },
    );
    await this.tokenRevocationService.revokeUserTokens(String(userId));
    this.socketEmit.disconnectUser(String(userId));
  }

  private async issueForActiveUser(userId: Types.ObjectId, familyId?: string): Promise<AuthTokens> {
    const user = await this.userModel.findById(userId);
    if (!user || !user.isActive) {
      throw new AppException({
        message: "User not found or inactive!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }
    return this.issueTokens(user, familyId);
  }
}
