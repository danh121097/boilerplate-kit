import { AppError } from "@/types";
import { verifyAccessToken } from "@/utils/jwt";
import { getUserRevokedAt, isAccessTokenRevoked } from "@/utils/token-revocation";
import type { JwtPayload } from "@/types/auth";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload | null;
  }
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
