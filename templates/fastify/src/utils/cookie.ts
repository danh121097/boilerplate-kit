import { config } from "@/config/environment";
import { accessTtlSeconds, refreshTtlSeconds } from "@/utils/token-lifetimes";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply } from "fastify";

const baseCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? "strict" : "lax",
  path: "/",
  domain: config.cookieDomain,
};

const refreshCookiePath = `${config.apiPrefix}/auth`;

export function setTokenCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
): void {
  reply.setCookie("accessToken", accessToken, {
    ...baseCookieOptions,
    maxAge: accessTtlSeconds(),
  });
  reply.setCookie("refreshToken", refreshToken, {
    ...baseCookieOptions,
    maxAge: refreshTtlSeconds(),
    path: refreshCookiePath,
  });
}

export function clearTokenCookies(reply: FastifyReply): void {
  reply.clearCookie("accessToken", baseCookieOptions);
  reply.clearCookie("refreshToken", { ...baseCookieOptions, path: refreshCookiePath });
}
