import { config } from "@/config/environment";
import { AppError } from "@/types";
import { NextFunction, Request, Response } from "express";

/**
 * CSRF defense via Origin/Referer allow-list — additive, opt-in.
 *
 * Cookie-based auth (unlike a Bearer header the page must set explicitly) is
 * auto-attached by the browser, so a cross-site page could trigger an
 * authenticated state-changing request. This middleware rejects mutating methods
 * whose `Origin` (falling back to `Referer`) is not in the allow-list.
 *
 * Gated by ENABLE_CSRF (default OFF) so it is backward-compatible: the
 * same-origin reverse-proxy deployment already closes CSRF via SameSite=strict;
 * turn this on for defense-in-depth or split-domain deployments.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface VerifyOriginOptions {
  enabled: boolean;
  allowList: string[];
}

/** Resolve the request origin: explicit `Origin`, else the `Referer`'s origin. */
function resolveOrigin(req: Request): string | undefined {
  const origin = req.headers.origin;
  if (origin) return origin;
  const referer = req.headers.referer;
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/** Build an Origin-allow-list middleware. Exposed as a factory for testability. */
export function createVerifyOrigin(opts: VerifyOriginOptions) {
  return function verifyOrigin(req: Request, _res: Response, next: NextFunction): void {
    if (!opts.enabled || SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = resolveOrigin(req);
    if (!origin || !opts.allowList.includes(origin)) {
      throw new AppError({
        message: "CSRF: request origin is not allowed!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }

    next();
  };
}

/** Default instance wired from config (corsOrigins allow-list, gated by ENABLE_CSRF). */
export const verifyOrigin = createVerifyOrigin({
  enabled: config.enableCsrf,
  allowList: config.corsOrigins,
});
