import { AppConfigService } from "@/config/app-config.service";
import type { CookieOptions, Response } from "express";

/**
 * Cookie helpers — ported from express utils/cookie.ts.
 *
 * Takes an express Response (Nest uses express under the hood; pass the response
 * from @Res({passthrough:true}) in controllers).
 *
 * IMPORTANT: clearTokenCookies spreads the EXACT same options object as setTokenCookies
 * (httpOnly, secure, sameSite, domain, path) — the browser only clears a cookie when
 * the clear request matches all attributes that were present on the Set-Cookie.
 */

/**
 * Set access + refresh token cookies on the response.
 * Access cookie: 15 min, path=/ (available to all routes for silent refresh).
 * Refresh cookie: 7 days, path=/{apiPrefix}/auth (scoped to auth routes only).
 */
export function setTokenCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  config: AppConfigService,
): void {
  const base: CookieOptions = buildBaseCookieOptions(config);
  const refreshPath = buildRefreshCookiePath(config);

  res.cookie("accessToken", accessToken, {
    ...base,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    ...base,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: refreshPath,
  });
}

/**
 * Clear access + refresh token cookies (logout).
 * Spreads IDENTICAL options to setTokenCookies so the browser matches and removes them.
 */
export function clearTokenCookies(res: Response, config: AppConfigService): void {
  const base: CookieOptions = buildBaseCookieOptions(config);
  const refreshPath = buildRefreshCookiePath(config);

  res.clearCookie("accessToken", base);
  res.clearCookie("refreshToken", { ...base, path: refreshPath });
}

/** Shared base options — must be identical between set and clear calls. */
function buildBaseCookieOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? "strict" : "lax",
    path: "/",
    domain: config.cookieDomain,
  };
}

/** Refresh cookie is scoped to auth routes only, derived from the API prefix. */
function buildRefreshCookiePath(config: AppConfigService): string {
  return `${config.apiPrefix}/auth`;
}
