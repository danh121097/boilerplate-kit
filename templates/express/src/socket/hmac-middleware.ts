import { SOCKET_UNAUTHORIZED } from "./events";
import { DEFAULT_CONTENT_TYPE, SOCKET_HMAC_PATH, verifyHmac } from "@/utils/hmac";
import type { Socket } from "socket.io";

/**
 * Handshake HMAC gate, mirroring the HTTP middleware. The client signs the fixed
 * socket contract and sends { sig, ctime } in the handshake auth payload:
 *   ['GET', 'application/json', ctime, '/socket', ''].join('\n')  // Base64 HMAC
 * Runs before socketAuth (HMAC = integrity/replay gate, JWT = identity).
 */
export function socketHmac(socket: Socket, next: (err?: Error) => void): void {
  const sig = socket.handshake.auth?.sig as string | undefined;
  const ctime = socket.handshake.auth?.ctime as string | number | undefined;

  if (!sig || ctime === undefined) return next(new Error(SOCKET_UNAUTHORIZED));

  const reason = verifyHmac({
    method: "GET",
    contentType: DEFAULT_CONTENT_TYPE,
    ctime,
    path: SOCKET_HMAC_PATH,
    sig,
  });

  if (reason) return next(new Error(SOCKET_UNAUTHORIZED));
  next();
}
