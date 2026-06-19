import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { AppException } from "@/common/exceptions/app.exception";
import { JwtPayload } from "@/common/types/auth.types";
import { AppConfigService } from "@/config/app-config.service";
import { AuthService } from "@/modules/auth/auth.service";
import { clearTokenCookies, setTokenCookies } from "@/modules/auth/cookie.util";
import { LoginDto } from "@/modules/auth/dto/login.dto";
import { RefreshDto } from "@/modules/auth/dto/refresh.dto";
import { RegisterDto } from "@/modules/auth/dto/register.dto";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

/**
 * Auth controller — thin wrapper around AuthService; mirrors express auth/controller.ts.
 *
 * Throttle strategy (dual-cap per route):
 *   register/refresh/logout → default(100/60s) + auth(30/900s)
 *   login                   → default(100/60s) + login(30/900s)
 * Listing 'default' explicitly keeps both counters running — omitting it would
 * override the global cap rather than extend it (ThrottlerModule behavior).
 *
 * Cookie dual-mode (refresh/logout):
 *   Body field takes precedence; falls back to httpOnly cookie.
 *   Mirrors express: `req.body?.refreshToken || req.cookies?.refreshToken`.
 *
 * Envelope shapes (match express exactly):
 *   register  → 201 { success:true, message, data:{ user, tokens } }
 *   login     → 200 { success:true, message, data:{ user, tokens } }
 *   refresh   → 200 { success:true, message, data:{ tokens } }
 *   logout    → 200 { success:true, message }
 *   me        → 200 { success:true, data:{ user } }
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  /** POST /auth/register — 201, public, auth throttle. */
  @Public()
  @Post("register")
  @HttpCode(201)
  @Throttle({ default: { limit: 100, ttl: 60_000 }, auth: { limit: 30, ttl: 900_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean; message: string; data: { user: unknown; tokens: unknown } }> {
    const { user, tokens } = await this.authService.register(dto.email, dto.password, dto.name);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken, this.config);
    return {
      success: true,
      message: "User registered successfully!",
      data: { user, tokens },
    };
  }

  /** POST /auth/login — 200, public, login throttle. */
  @Public()
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 100, ttl: 60_000 }, login: { limit: 30, ttl: 900_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean; message: string; data: { user: unknown; tokens: unknown } }> {
    const { user, tokens } = await this.authService.login(dto.email, dto.password);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken, this.config);
    return {
      success: true,
      message: "Login successful!",
      data: { user, tokens },
    };
  }

  /**
   * POST /auth/refresh — 200, public, auth throttle.
   * Token accepted from body OR httpOnly cookie (dual-mode: CSR + SSR clients).
   */
  @Public()
  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 100, ttl: 60_000 }, auth: { limit: 30, ttl: 900_000 } })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean; message: string; data?: { tokens: unknown } }> {
    const rawToken: string | undefined =
      dto.refreshToken ?? (req.cookies as Record<string, string> | undefined)?.["refreshToken"];

    if (!rawToken) {
      throw new AppException({
        message: "Refresh token not found in request body or cookies!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    const tokens = await this.authService.refresh(rawToken);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken, this.config);
    return {
      success: true,
      message: "Tokens refreshed successfully!",
      data: { tokens },
    };
  }

  /**
   * POST /auth/logout — 200, public, auth throttle.
   * Token accepted from body OR httpOnly cookie — same dual-mode as refresh.
   * No token is valid too (client already cleared cookies); just clears cookies.
   */
  @Public()
  @Post("logout")
  @HttpCode(200)
  @Throttle({ default: { limit: 100, ttl: 60_000 }, auth: { limit: 30, ttl: 900_000 } })
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean; message: string }> {
    const rawToken: string | undefined =
      dto.refreshToken ?? (req.cookies as Record<string, string> | undefined)?.["refreshToken"];

    if (rawToken) {
      await this.authService.logout(rawToken);
    }

    clearTokenCookies(res, this.config);
    return { success: true, message: "Logged out successfully!" };
  }

  /** GET /auth/me — 200, JWT required (not @Public). */
  @Get("me")
  @HttpCode(200)
  async getMe(
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ success: boolean; data: { user: unknown } }> {
    const user = await this.authService.getMe(currentUser.userId);
    return { success: true, data: { user } };
  }
}
