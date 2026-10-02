import {
  DEFAULT_CONTENT_TYPE,
  HmacService,
  SOCKET_HMAC_PATH,
} from "@/common/services/hmac.service";
import { TokenRevocationService, isTokenRevoked } from "@/common/services/token-revocation.service";
import { TokenService } from "@/common/services/token.service";
import { SOCKET_UNAUTHORIZED } from "@/modules/realtime/events";
import type { ErrorType } from "@/common/exceptions/app.exception";
import type { JwtPayload } from "@/common/types/auth.types";
import type { Socket } from "socket.io";

type Next = (err?: Error) => void;

/**
 * HMAC rejection: same message as a token rejection, plus `data.errorType` (the HTTP
 * HMAC_ERROR value) so a client can tell clock skew from a bad session without
 * spending a token refresh. socket.io hands `data` to the client's `connect_error`.
 */
const HMAC_ERROR: ErrorType = "HMAC_ERROR";
function hmacRejection(): Error & { data: { errorType: ErrorType } } {
  return Object.assign(new Error(SOCKET_UNAUTHORIZED), { data: { errorType: HMAC_ERROR } });
}

/**
 * Handshake HMAC gate (integrity + replay). The client signs the fixed socket
 * contract and sends { sig, ctime } in the handshake auth payload. Runs before the
 * JWT gate, mirroring express socket/hmac-middleware.ts.
 */
export function createSocketHmacMiddleware(hmacService: HmacService) {
  return (socket: Socket, next: Next): void => {
    const sig = socket.handshake.auth?.sig as string | undefined;
    const ctime = socket.handshake.auth?.ctime as string | number | undefined;
    if (!sig || ctime === undefined) return next(hmacRejection());

    const reason = hmacService.verifyHmac({
      method: "GET",
      contentType: DEFAULT_CONTENT_TYPE,
      ctime,
      path: SOCKET_HMAC_PATH,
      sig,
    });
    if (reason) return next(hmacRejection());
    next();
  };
}

/** Read a single cookie value from a raw Cookie header. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Access token from the handshake auth payload, falling back to the cookie. */
function extractToken(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token as string | undefined;
  if (fromAuth) return fromAuth.startsWith("Bearer ") ? fromAuth.slice(7) : fromAuth;
  return readCookie(socket.handshake.headers.cookie, "accessToken");
}

/**
 * Handshake JWT gate (identity + revocation). Accepts only a valid, non-revoked
 * access token and populates socket.data.user for the gateway. Mirrors express
 * socket/auth-middleware.ts.
 */
export function createSocketAuthMiddleware(
  tokenService: TokenService,
  revocationService: TokenRevocationService,
) {
  return async (socket: Socket, next: Next): Promise<void> => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error(SOCKET_UNAUTHORIZED));

      const payload = tokenService.verifyAccessToken(token) as JwtPayload & {
        iat?: number;
        iat_ms?: number;
      };
      const revokedAt = await revocationService.getUserRevokedAt(payload.userId);
      if (isTokenRevoked(payload, revokedAt)) return next(new Error(SOCKET_UNAUTHORIZED));

      socket.data.user = payload;
      next();
    } catch {
      next(new Error(SOCKET_UNAUTHORIZED));
    }
  };
}
