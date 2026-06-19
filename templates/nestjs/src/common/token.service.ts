import { JwtPayload } from "@/common/types/auth.types";
import { AppConfigService } from "@/config/app-config.service";
import { Injectable } from "@nestjs/common";
import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * Injectable JWT service — wraps express utils/jwt.ts verbatim.
 *
 * Naming decision: named `TokenService` (not `JwtService`) to avoid shadowing
 * `@nestjs/jwt`'s JwtService in editors/imports. We never import @nestjs/jwt.
 *
 * Access tokens:  RS256 (RSA keypair in src/keys/) — asymmetric so resource servers
 *                  can verify with the public key without holding signing power.
 * Refresh tokens: HS256 with the JWT_REFRESH_SECRET — symmetric is appropriate because
 *                  refresh tokens are only ever verified by this auth server (never sent
 *                  to third parties). Validity is also established by a DB hash lookup on
 *                  the hot path; the signature is a secondary check.
 * token_use claim: distinguishes access vs refresh so a refresh token can never
 *                  satisfy access verification and vice-versa.
 * jti:            random UUID per refresh token so two tokens for the same user
 *                 signed within the same second are never byte-identical.
 * issuer:         first CORS origin (undefined disables the check in dev/test).
 */

type TokenUse = "access" | "refresh";

@Injectable()
export class TokenService {
  private readonly tokenIssuer: string | undefined;

  constructor(private readonly config: AppConfigService) {
    const origins = config.corsOrigins;
    this.tokenIssuer = Array.isArray(origins) ? origins[0] : origins;
  }

  /** Sign a short-lived access token (RS256, keypair). */
  signAccessToken(payload: JwtPayload): string {
    return jwt.sign({ ...payload, token_use: "access" }, this.config.jwtAccessPrivateKey, {
      algorithm: "RS256",
      issuer: this.tokenIssuer,
      expiresIn: this.config.jwtAccessExpiry as jwt.SignOptions["expiresIn"],
    });
  }

  /**
   * Verify an access token. Pins RS256 + issuer + token_use=access.
   * Throws jsonwebtoken errors (JsonWebTokenError, TokenExpiredError) on failure.
   */
  verifyAccessToken(token: string): JwtPayload {
    const decoded = jwt.verify(token, this.config.jwtAccessPublicKey, {
      algorithms: ["RS256"],
      issuer: this.tokenIssuer,
    }) as JwtPayload & { token_use?: TokenUse };

    if (decoded.token_use !== "access") {
      throw new Error("Invalid token_use claim");
    }
    return decoded;
  }

  /**
   * Sign a long-lived refresh token (HS256, symmetric secret — issuer-only token).
   * jti is a random UUID so simultaneous signs for the same user differ.
   */
  signRefreshToken(payload: JwtPayload): string {
    return jwt.sign({ ...payload, token_use: "refresh" }, this.config.jwtRefreshSecret, {
      algorithm: "HS256",
      issuer: this.tokenIssuer,
      expiresIn: this.config.jwtRefreshExpiry as jwt.SignOptions["expiresIn"],
      jwtid: crypto.randomUUID(),
    });
  }

  /**
   * Verify a refresh token. Pins HS256 + issuer + token_use=refresh.
   * Algorithm matches signRefreshToken (HS256, symmetric secret).
   */
  verifyRefreshToken(token: string): JwtPayload {
    const decoded = jwt.verify(token, this.config.jwtRefreshSecret, {
      algorithms: ["HS256"],
      issuer: this.tokenIssuer,
    }) as JwtPayload & { token_use?: TokenUse };

    if (decoded.token_use !== "refresh") {
      throw new Error("Invalid token_use claim");
    }
    return decoded;
  }

  /** SHA-256 hash a token for secure DB storage (matches express hashToken). */
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
