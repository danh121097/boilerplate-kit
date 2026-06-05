import { AppError } from "@/types";
import { JwtPayload } from "@/types/auth";
import { verifyAccessToken } from "@/utils/jwt";
import { getUserRevokedAt } from "@/utils/token-revocation";
import { NextFunction, Request, Response } from "express";

/** Extend Express Request to include authenticated user */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augmenting the Express global Request type requires a namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Extract access token from Bearer header or cookie */
function extractAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return req.cookies?.accessToken;
}

/** Verify JWT access token from Authorization header or cookie */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  let decoded: JwtPayload & { iat?: number };
  try {
    const token = extractAccessToken(req);
    if (!token) {
      throw new AppError({
        message: "Access token required!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }

    decoded = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      message: "Invalid or expired access token!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  // User-level revocation: reject tokens issued before a logout/ban cutoff.
  // No-op when Redis is disabled (getUserRevokedAt returns null).
  const revokedAt = await getUserRevokedAt(decoded.userId);
  if (revokedAt && decoded.iat && decoded.iat < revokedAt) {
    throw new AppError({
      message: "Token revoked! Please log in again!",
      statusCode: 401,
      errorType: "AUTHENTICATION_ERROR",
    });
  }

  req.user = decoded;
  next();
}
