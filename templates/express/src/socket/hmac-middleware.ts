import { SOCKET_UNAUTHORIZED } from "@/socket/events";
import { DEFAULT_CONTENT_TYPE, SOCKET_HMAC_PATH, verifyHmac } from "@/utils/hmac";
import type { ErrorType } from "@/types";
import type { ExtendedError, Socket } from "socket.io";

const HMAC_ERROR: ErrorType = "HMAC_ERROR";

/**
 * Same message as a token rejection, plus `data.errorType` (delivered to the client's
 * `connect_error`) so a client can tell a bad signature or clock skew from a bad
 * session and skip the token refresh.
 */
function hmacRejection(): ExtendedError {
  const err: ExtendedError = new Error(SOCKET_UNAUTHORIZED);
  err.data = { errorType: HMAC_ERROR };
  return err;
}

/**
 * Handshake HMAC gate, mirroring the HTTP middleware. The client signs the fixed
 * socket contract and sends { sig, ctime } in the handshake auth payload:
 *   ['GET', 'application/json', ctime, '/socket', ''].join('\n')  // Base64 HMAC
 * A rejection carries `data: { errorType: "HMAC_ERROR" }`.
 * Runs before socketAuth (HMAC = integrity/replay gate, JWT = identity).
 */
export function socketHmac(socket: Socket, next: (err?: Error) => void): void {
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
