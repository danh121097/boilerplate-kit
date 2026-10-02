import { AppException } from "@/common/exceptions/app.exception";
import { AppConfigService } from "@/config/app-config.service";
import type { Request } from "express";
import type { IncomingHttpHeaders } from "http";

/** Read-only methods exempt from the check; every other method must pass it. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Resolve Origin header, falling back to the origin part of Referer. */
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
 * The origin predicate shared by the HTTP guard and the Socket.IO handshake.
 *
 * A request carrying no Cookie, no Origin and no Referer header has no ambient
 * credentials to forge, so it passes (native/non-browser clients). Browsers always
 * send Origin on cross-site POSTs and websocket upgrades, so browser CSRF stays
 * closed. Raw header presence is tested, not the parsed origin, so a malformed
 * Referer is not mistaken for an absent one. Anything else must resolve (Origin,
 * else Referer) to an allow-listed origin.
 */
export function isOriginAllowed(headers: IncomingHttpHeaders, corsOrigins: string[]): boolean {
  if (!headers.cookie && !headers.origin && !headers.referer) return true;
  const origin = resolveOrigin(headers);
  return origin !== undefined && corsOrigins.includes(origin);
}

/** True when the Origin header names this server's own host (`host:port`, case-insensitive). */
export function isSameOrigin(headers: IncomingHttpHeaders): boolean {
  const { origin, host } = headers;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Origin/CSRF check: when enableCsrf is on, every non-safe request must come from an
 * allow-listed origin (see isOriginAllowed). Throws 403 otherwise.
 */
export function assertAllowedOrigin(
  req: Request,
  config: Pick<AppConfigService, "enableCsrf" | "corsOrigins">,
): void {
  if (!config.enableCsrf) return;
  if (SAFE_METHODS.has(req.method)) return;
  if (isOriginAllowed(req.headers, config.corsOrigins)) return;

  throw new AppException({
    message: "CSRF: request origin is not allowed!",
    statusCode: 403,
    errorType: "AUTHORIZATION_ERROR",
  });
}
