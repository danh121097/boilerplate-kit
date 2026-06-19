import { IS_PUBLIC_KEY } from "@/common/decorators/public.decorator";
import { ROLES_KEY } from "@/common/decorators/roles.decorator";
import { AppException } from "@/common/exceptions/app.exception";
import { HmacService } from "@/common/hmac.service";
import { TokenRevocationService } from "@/common/token-revocation.service";
import { TokenService } from "@/common/token.service";
import { ROLE_RANK, Role } from "@/common/types/auth.types";
import { AppConfigService } from "@/config/app-config.service";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtPayload } from "@/common/types/auth.types";
import type { Request } from "express";

/**
 * Derive the path the client signed from the raw request URL.
 *
 * Nest setGlobalPrefix does NOT strip the API prefix from req.originalUrl in
 * a guard (unlike Express app.use(prefix, ...) which pre-strips it). We must
 * manually strip the prefix so the signed path matches what the client sends:
 *   req.originalUrl = "/api/v1/auth/login?foo=bar"  →  "/auth/login"
 *
 * Exported for unit testing.
 */
export function derivePath(originalUrl: string, apiPrefix: string): string {
  // Ensure prefix starts with "/" for consistent stripping.
  const prefix = apiPrefix.startsWith("/") ? apiPrefix : `/${apiPrefix}`;
  // Strip query string first, then strip the prefix.
  const withoutQuery = originalUrl.split("?")[0];
  if (withoutQuery.startsWith(prefix)) {
    const stripped = withoutQuery.slice(prefix.length);
    // Ensure result always starts with "/".
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }
  // Fallback: return as-is without query string.
  return withoutQuery;
}

/** Methods that carry a body and can trigger CSRF. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Composite security guard — runs a fixed sequence:
 *   1. HMAC integrity  (all routes including @Public and /health)
 *   2. Origin/CSRF     (gated by config.enableCsrf, mutating methods only)
 *   3. JWT identity    (skipped for @Public routes)
 *   4. Role check      (skipped when no @Roles metadata)
 *
 * Using a single composite guard guarantees deterministic execution order
 * regardless of APP_GUARD array order (which NestJS does not guarantee).
 * Mirrors express middleware chain: hmac → verifyOrigin → [authenticate, requireMinRole].
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly hmacService: HmacService,
    private readonly tokenService: TokenService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();

    // Step 1: HMAC — applies to ALL routes (no @Public exemption, no /health exemption).
    this.checkHmac(req);

    // Step 2: Origin/CSRF — only when enableCsrf and mutating method.
    this.checkOrigin(req);

    // Step 3: JWT — skip for @Public routes.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isPublic) {
      await this.checkJwt(req);
    }

    // Step 4: Roles — only when @Roles metadata is present (requires Step 3 to have run).
    const minRole = this.reflector.getAllAndOverride<Role | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (minRole !== undefined) {
      // @Roles used on a @Public route would be a programming mistake, but guard defensively.
      if (!req.user) {
        throw new AppException({
          message: "Authentication required!",
          statusCode: 401,
          errorType: "AUTHENTICATION_ERROR",
        });
      }
      this.checkRole(req.user, minRole);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Private step methods
  // ---------------------------------------------------------------------------

  /**
   * HMAC step: reads `sig` + `ctime` headers, reconstructs the signed string,
   * and verifies freshness + signature. Path is derived by stripping the API
   * prefix (set via setGlobalPrefix) from req.originalUrl.
   *
   * Content-type is taken verbatim from the request header or "" when absent.
   * DEFAULT_CONTENT_TYPE is socket-only — never used here.
   */
  private checkHmac(req: Request): void {
    const sig = req.headers["sig"] as string | undefined;
    const ctime = req.headers["ctime"] as string | undefined;

    if (!sig || !ctime) {
      throw new AppException({
        message: "HMAC signature and timestamp headers are required!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    const path = derivePath(req.originalUrl, this.config.apiPrefix);

    const reason = this.hmacService.verifyHmac({
      method: req.method,
      // Raw content-type or "" — NEVER default to DEFAULT_CONTENT_TYPE (socket-only).
      contentType: (req.headers["content-type"] as string | undefined) ?? "",
      ctime,
      path,
      sig,
    });

    if (reason) {
      throw new AppException({
        message: `HMAC verification failed: ${reason}!`,
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }
  }

  /**
   * Origin/CSRF step: mirrors express createVerifyOrigin.
   * Gated by config.enableCsrf; only applied to mutating methods.
   * Resolves Origin header, falling back to Referer host.
   */
  private checkOrigin(req: Request): void {
    if (!this.config.enableCsrf) return;
    if (!MUTATING_METHODS.has(req.method)) return;

    const origin = this.resolveOrigin(req);
    if (!origin || !this.config.corsOrigins.includes(origin)) {
      throw new AppException({
        message: "CSRF: request origin is not allowed!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }
  }

  /** Resolve Origin header, falling back to the origin part of Referer. */
  private resolveOrigin(req: Request): string | undefined {
    const origin = req.headers.origin as string | undefined;
    if (origin) return origin;
    const referer = req.headers.referer as string | undefined;
    if (!referer) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }

  /**
   * JWT step: extract token from Authorization Bearer header or accessToken cookie,
   * verify with TokenService, check user-level revocation (fail-open when Redis is
   * disabled or on Redis error), and set req.user.
   *
   * Mirrors express authenticate middleware exactly.
   */
  private async checkJwt(req: Request & { user?: JwtPayload }): Promise<void> {
    const token = this.extractToken(req);
    if (!token) {
      throw new AppException({
        message: "Access token required!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    let payload: JwtPayload & { iat?: number };
    try {
      payload = this.tokenService.verifyAccessToken(token) as JwtPayload & { iat?: number };
    } catch {
      throw new AppException({
        message: "Invalid or expired access token!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    // Revocation check — fail-open: null when Redis disabled or on error.
    const revokedAt = await this.tokenRevocationService.getUserRevokedAt(payload.userId);
    if (revokedAt && payload.iat && payload.iat < revokedAt) {
      throw new AppException({
        message: "Token revoked! Please log in again!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    req.user = payload;
  }

  /** Extract Bearer token from Authorization header, or accessToken cookie. */
  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.split(" ")[1];
    }
    // Express cookie-parser populates req.cookies (applied in main.ts before guards).
    return (req as Request & { cookies?: Record<string, string> }).cookies?.accessToken;
  }

  /**
   * Role step: compare the authenticated user's rank against the minimum required.
   * Mirrors express requireMinRole exactly.
   */
  private checkRole(user: JwtPayload, minRole: Role): void {
    const requiredRank = ROLE_RANK[minRole];
    if (ROLE_RANK[user.role] < requiredRank) {
      throw new AppException({
        message: "Insufficient permissions!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }
  }
}
