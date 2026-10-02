import { SOCKET_HMAC_ERROR_TYPE, SOCKET_UNAUTHORIZED } from "@/socket/events";
import { DEFAULT_CONTENT_TYPE, SOCKET_HMAC_PATH, verifyHmac } from "@/utils/hmac";
import type { Socket } from "socket.io";

/** socket.io forwards `data` on a middleware error to the client's `connect_error`. */
type HandshakeError = Error & { data?: { errorType: string } };

/**
 * Same message as a token rejection; `data.errorType` lets the client tell a clock/signature
 * problem from an expired token (socket.io hands `data` to the client's `connect_error`).
 */
function hmacRejection(): HandshakeError {
  const error: HandshakeError = new Error(SOCKET_UNAUTHORIZED);
  error.data = { errorType: SOCKET_HMAC_ERROR_TYPE };
  return error;
}

/**
 * Handshake HMAC gate, mirroring the HTTP middleware. The client signs the fixed
 * socket contract and sends { sig, ctime } in the handshake auth payload:
 *   ['GET', 'application/json', ctime, '/socket', ''].join('\n')  // Base64 HMAC
 * Runs before socketAuth (HMAC = integrity/replay gate, JWT = identity).
 */
export function socketHmac(socket: Socket, next: (err?: HandshakeError) => void): void {
  const sig = socket.handshake.auth?.sig as string | undefined;
  const ctime = socket.handshake.auth?.ctime as string | number | undefined;

  if (!sig || ctime === undefined) return next(hmacRejection());

  const reason = verifyHmac({
    method: "GET",
    contentType: DEFAULT_CONTENT_TYPE,
    ctime,
    path: SOCKET_HMAC_PATH,
    sig,
  });

  if (reason) return next(hmacRejection());
  next();
}
