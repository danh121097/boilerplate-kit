import { config } from "@/config/environment";
import { AppError } from "@/types";
import { verifyHmac } from "@/utils/hmac";
import { verifyAccessToken } from "@/utils/jwt";
import { getUserRevokedAt, isAccessTokenRevoked } from "@/utils/token-revocation";
import type { JwtPayload, Role } from "@/types/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload | null;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ROLE_RANK: Record<Role, number> = { user: 1, admin: 2, super_admin: 3 };

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
        errorType: "AUTHENTICATION_ERROR",
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
        errorType: "AUTHENTICATION_ERROR",
      });
    }
  });

  app.addHook("onRequest", async (request) => {
    if (!config.enableCsrf || SAFE_METHODS.has(request.method)) return;
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

/** Authenticate from a bearer token or the accessToken cookie. */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.cookies?.accessToken;
  if (!token) {
    throw new AppError({
      message: "Access token required!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  let payload: JwtPayload & { iat?: number; iat_ms?: number };
  try {
    payload = verifyAccessToken(token) as JwtPayload & { iat?: number; iat_ms?: number };
  } catch {
    throw new AppError({
      message: "Invalid or expired access token!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  if (isAccessTokenRevoked(payload, await getUserRevokedAt(payload.userId))) {
    throw new AppError({
      message: "Token revoked! Please log in again!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }
  request.user = payload;
}

/** Enforce a minimum role rank after authenticate has populated request.user. */
export function requireMinRole(minRole: Role) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AppError({
        message: "Authentication required!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }
    if (ROLE_RANK[request.user.role] < ROLE_RANK[minRole]) {
      throw new AppError({
        message: "Insufficient permissions!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }
  };
}
