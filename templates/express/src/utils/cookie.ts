import { config } from '@/config/environment';
import { CookieOptions, Response } from 'express';

/** Shared cookie options for secure HTTP-only cookies */
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? 'strict' : 'lax',
  path: '/'
};

/** Refresh cookie is scoped to auth routes only, derived from the API prefix. */
const refreshCookiePath = `${config.apiPrefix}/auth`;

/** Set access + refresh token cookies on the response */
export function setTokenCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): void {
  res.cookie('accessToken', accessToken, {
    ...baseCookieOptions,
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    ...baseCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: refreshCookiePath // only sent to auth routes
  });
}

/** Clear token cookies (logout) */
export function clearTokenCookies(res: Response): void {
  res.clearCookie('accessToken', baseCookieOptions);
  res.clearCookie('refreshToken', {
    ...baseCookieOptions,
    path: refreshCookiePath
  });
}
