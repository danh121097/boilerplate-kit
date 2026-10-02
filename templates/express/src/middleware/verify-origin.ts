import { config } from "@/config/environment";
import { AppError } from "@/types";
import { NextFunction, Request, Response } from "express";
import type { IncomingHttpHeaders } from "http";

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
 *
 * Non-browser clients (native apps, server-to-server) are exempt when the request
 * carries no `Cookie`, `Origin` or `Referer` header: with no ambient credentials
 * there is nothing for a forged request to ride on, and browsers always send
 * `Origin` on a cross-site mutating request, so browser CSRF stays closed.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface VerifyOriginOptions {
  enabled: boolean;
  allowList: string[];
}

/** Resolve the request origin: explicit `Origin`, else the `Referer`'s origin. */
function resolveOrigin(headers: IncomingHttpHeaders): string | undefined {
  const origin = headers.origin;
  if (origin) return origin;
  const referer = headers.referer;
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * The CSRF origin rule, shared by the HTTP guard and the Socket.IO handshake. A request
 * with no `Cookie`, `Origin` or `Referer` header passes (raw header presence, so a
 * malformed Referer is not treated as absent); otherwise its resolved origin must be in
 * the allow-list. Does not look at the method or at ENABLE_CSRF — callers do.
 */
export function isOriginAllowed(headers: IncomingHttpHeaders, allowList: string[]): boolean {
  if (!headers.cookie && !headers.origin && !headers.referer) return true;
  const origin = resolveOrigin(headers);
  return origin !== undefined && allowList.includes(origin);
}

/**
 * True when the `Origin` header names this server's own host (`Host` header), compared
 * as host[:port] case-insensitively. A native WebSocket (React Native) sends an Origin
 * equal to the API's own origin and may carry cookies from its jar; a cross-site page
 * cannot forge that, because its Origin is its own. A missing, `null` or malformed Origin
 * is not same-origin, and a different port is a different host.
 */
export function isSameOrigin(headers: IncomingHttpHeaders): boolean {
  const { origin, host } = headers;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/** Build an Origin-allow-list middleware. Exposed as a factory for testability. */
export function createVerifyOrigin(opts: VerifyOriginOptions) {
  return function verifyOrigin(req: Request, _res: Response, next: NextFunction): void {
    if (!opts.enabled || SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    if (!isOriginAllowed(req.headers, opts.allowList)) {
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
