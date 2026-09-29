import { AppException } from "@/common/exceptions/app.exception";
import { AuthTokens } from "@/common/types/auth.types";
import { PasswordService } from "@/modules/auth/password.service";
import { RefreshSessionService } from "@/modules/auth/refresh-session.service";
import { User, UserDocument } from "@/schemas/user.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import bcrypt from "bcrypt";

/** Must match the cost factor used by the User schema's pre-save hook. */
const BCRYPT_ROUNDS = 12;

/**
 * Hash compared against when the user is unknown or inactive, so those logins
 * cost one bcrypt compare like a real one. Computed once at module load, at the real cost.
 */
const dummyHash: Promise<string> = bcrypt.hash("timing-equalizer-not-a-password", BCRYPT_ROUNDS);

/**
 * Auth service.
 *
 *  - register: strength check → uniqueness check → create user → issue tokens
 *  - login: no enumeration (unknown/inactive == wrong password: same message and
 *    the same bcrypt work)
 *  - refresh / logout: delegated to RefreshSessionService
 *  - getMe: find by id, throw 404 if missing/inactive
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly passwordService: PasswordService,
    private readonly sessions: RefreshSessionService,
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
    return { user, tokens: await this.sessions.issueTokens(user) };
  }

  /** Authenticate by email/password. */
  async login(
    email: string,
    password: string,
  ): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() }).select("+password");

    const usable = user?.isActive ? user : null;
    const isMatch = usable
      ? await usable.comparePassword(password)
      : await bcrypt.compare(password, await dummyHash).then(() => false);

    if (!usable || !isMatch) {
      throw new AppException({
        message: "Invalid email or password!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    return { user: usable, tokens: await this.sessions.issueTokens(usable) };
  }

  /** Rotate a refresh token — see RefreshSessionService.refresh. */
  refresh(rawRefreshToken: string): Promise<AuthTokens> {
    return this.sessions.refresh(rawRefreshToken);
  }

  /** Revoke a refresh token and the user's sessions — see RefreshSessionService.logout. */
  logout(rawRefreshToken: string): Promise<void> {
    return this.sessions.logout(rawRefreshToken);
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
}
