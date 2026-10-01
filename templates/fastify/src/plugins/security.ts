import { config } from "@/config/environment";
import { AppError } from "@/types";
import { verifyHmac } from "@/utils/hmac";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(request: FastifyRequest): string | undefined {
  const origin = request.headers.origin;
  if (origin) return origin;
  const referer = request.headers.referer;
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
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
    // Native/non-browser clients send no ambient credentials (no Cookie) and no
    // Origin/Referer, so there is nothing to forge. Checked on raw header presence,
    // not a parsed origin, so a malformed Referer is not mistaken for absent.
    // Browsers always attach Origin to cross-site writes, which keeps CSRF closed.
    const { cookie, origin: originHeader, referer } = request.headers;
    if (!cookie && !originHeader && !referer) return;
    const origin = requestOrigin(request);
    if (!origin || !config.corsOrigins.includes(origin)) {
      throw new AppError({
        message: "CSRF: request origin is not allowed!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }
  });
}
