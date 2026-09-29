import { config } from "@/config/environment";
import { accessTtlSeconds, refreshTtlSeconds } from "@/utils/token-lifetimes";
import { CookieOptions, Response } from "express";

/** Shared cookie options for secure HTTP-only cookies.
 * `domain` is undefined by default (host-only cookie, same-origin proxy deploy);
 * set COOKIE_DOMAIN (e.g. ".example.com") for split-domain deploys where an SSR
 * frontend on a sibling host must receive the cookie. */
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? "strict" : "lax",
  path: "/",
  domain: config.cookieDomain,
};

/** Refresh cookie is scoped to auth routes only, derived from the API prefix. */
const refreshCookiePath = `${config.apiPrefix}/auth`;

/** Set access + refresh token cookies on the response */
export function setTokenCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie("accessToken", accessToken, {
    ...baseCookieOptions,
    maxAge: accessTtlSeconds() * 1000, // JWT_ACCESS_EXPIRY
  });

  res.cookie("refreshToken", refreshToken, {
    ...baseCookieOptions,
    maxAge: refreshTtlSeconds() * 1000, // JWT_REFRESH_EXPIRY
    path: refreshCookiePath, // only sent to auth routes
  });
}

/** Clear token cookies (logout) */
export function clearTokenCookies(res: Response): void {
  res.clearCookie("accessToken", baseCookieOptions);
  res.clearCookie("refreshToken", {
    ...baseCookieOptions,
    path: refreshCookiePath,
  });
}
