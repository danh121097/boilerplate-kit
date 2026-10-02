import { config } from "@/config/environment";
import { AppError } from "@/types";
import { verifyHmac } from "@/utils/hmac";
import type { FastifyInstance } from "fastify";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(headers: IncomingHttpHeaders): string | undefined {
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
 * The CSRF origin rule, shared by the HTTP hook and the Socket.IO handshake. A request
 * with no `Cookie`, `Origin` or `Referer` header passes (native/non-browser clients send
 * no ambient credentials, so there is nothing to forge); otherwise its resolved origin
 * must be in the allow-list. Checked on raw header presence, not a parsed origin, so a
 * malformed Referer is not mistaken for absent. Does not look at the method or at
 * ENABLE_CSRF — callers do.
 */
export function isOriginAllowed(headers: IncomingHttpHeaders, allowList: string[]): boolean {
  if (!headers.cookie && !headers.origin && !headers.referer) return true;
  const origin = requestOrigin(headers);
  return origin !== undefined && allowList.includes(origin);
}

/**
 * True when the request's `Origin` names the server itself (its host equals the `Host`
 * header, compared case-insensitively). Native WebSocket clients send the API's own
 * origin, and a cross-site page cannot forge either header. A missing or malformed
 * Origin (including `null`) is never same-origin. Port is part of the host.
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

/** Install security hooks before API routes so HMAC and CSRF checks run first. */
export function installSecurityHooks(
  app: FastifyInstance<import("fastify").RawServerDefault, IncomingMessage, ServerResponse>,
): void {
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request) => {
    const requestPath = request.url.split("?", 1)[0] || "/";
    const isApiPath =
      requestPath === config.apiPrefix || requestPath.startsWith(`${config.apiPrefix}/`);
    if (!isApiPath || request.method === "OPTIONS") return;

    const sig = request.headers.sig;
    const ctime = request.headers.ctime;
    if (typeof sig !== "string" || typeof ctime !== "string") {
      throw new AppError({
        message: "HMAC signature and timestamp headers are required!",
        statusCode: 401,
        errorType: "HMAC_ERROR",
      });
    }

    const path = requestPath.slice(config.apiPrefix.length) || "/";
    const reason = verifyHmac({
      method: request.method,
      contentType: request.headers["content-type"] ?? "",
      ctime,
      path,
      sig,
    });
    if (reason) {
      throw new AppError({
        message: `HMAC verification failed: ${reason}!`,
        statusCode: 401,
        errorType: "HMAC_ERROR",
      });
    }
  });

  app.addHook("onRequest", async (request) => {
    if (!config.enableCsrf || SAFE_METHODS.has(request.method)) return;
    // Browsers always attach Origin to cross-site writes, which keeps CSRF closed.
    if (!isOriginAllowed(request.headers, config.corsOrigins)) {
      throw new AppError({
        message: "CSRF: request origin is not allowed!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }
  });
}
