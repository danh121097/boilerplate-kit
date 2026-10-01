import { SOCKET_EVENT } from "@/enums";
import { getApiOrigin } from "@/services/core/api-config";
import { isRefreshRefused, SessionEndedError } from "@/services/core/api-errors";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { refreshSession } from "@/services/core/interceptors";
import { hasStoredSession } from "@/services/core/session";
import { io, type Socket } from "socket.io-client";

/** First retry delay after the server rejects a handshake; doubles per attempt. */
export const RECONNECT_BASE_MS = 2000;
/** Ceiling of the retry delay. */
export const RECONNECT_MAX_MS = 30_000;
/** Consecutive token refreshes attempted per outage; reset once `authenticated` arrives. */
export const MAX_REFRESH_ATTEMPTS = 3;
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";
/** `connect_error` message the backend sends when it rejects a handshake (HMAC or token). */
const HANDSHAKE_REJECTED = "Unauthorized!";

/**
 * Build the per-handshake `{ sig, ctime }` expected by HMAC-protected backends,
 * signed by the same generator as the HTTP requests. Empty when `VITE_HMAC_SECRET`
 * is not set — the server can then accept the bare bearer token alone (or reject).
 *
 * SECURITY: a `VITE_*` env var is exposed to every browser client. Production
 * deployments should sign on the server (a dedicated API route or a BFF
 * proxy) and forward the resulting headers to the socket handshake.
 */
function signHeader(): { sig?: string; ctime?: number } {
  const signed = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  return signed ? { sig: signed.sig, ctime: signed.ctime } : {};
}

/** Handshake payload: `token` only when signed in (never an empty `Bearer`), plus a fresh signature. */
function buildAuth(): { token?: string; sig?: string; ctime?: number } {
  const token = getAccessToken();
  return { ...(token ? { token: `Bearer ${token}` } : {}), ...signHeader() };
}

/**
 * Create the (not yet connected) socket against `getApiOrigin()`. `auth` is
 * the callback form, so every connect and reconnect is signed afresh with the
 * current token and a new `ctime`.
 */
export function createSocket(): Socket {
  return io(getApiOrigin(), {
    auth: (cb) => cb(buildAuth()),
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    forceBase64: true,
  });
}

/** Connect unless already connected or signed out (no access token → nothing to authenticate). */
export function connectSocket(socket: Socket): boolean {
  if (!getAccessToken()) return false;
  if (!socket.connected) socket.connect();
  return true;
}

export interface SocketLifecycle {
  /** Cancel a pending retry / in-flight recovery and reset the backoff. Listeners stay. */
  stop: () => void;
  /** `stop` and remove every listener. */
  detach: () => void;
}

/**
 * Drive the socket's reconnect behaviour and report `authenticated` changes.
 *
 * - `authenticated` event: `onAuthenticated(true)`, backoff and refresh budget reset.
 * - `disconnect` / `connect_error`: `onAuthenticated(false)`.
 * - `connect_error` while socket.io is still auto-reconnecting (`socket.active`):
 *   nothing extra. Otherwise the server rejected the handshake: `"Unauthorized!"`
 *   refreshes the session once and reconnects once; a refused refresh ends the
 *   session and stops; a transient failure, any other rejection, or an exhausted
 *   refresh budget (`MAX_REFRESH_ATTEMPTS` since the last `authenticated`) falls
 *   back to one retry timer with exponential backoff (`RECONNECT_BASE_MS` doubling
 *   up to `RECONNECT_MAX_MS`) that reconnects without refreshing.
 * - `io server disconnect` joins the same backoff (socket.io never retries it).
 */
export function attachSocketLifecycle(
  socket: Socket,
  onAuthenticated: (authenticated: boolean) => void,
): SocketLifecycle {
  let attempt = 0;
  let refreshAttempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Bumped by `stop` so a recovery still awaiting its refresh does not reconnect.
  let generation = 0;

  const scheduleRetry = () => {
    if (timer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      connectSocket(socket);
    }, delay);
  };

  const recover = async () => {
    if (!hasStoredSession()) return;
    const started = generation;
    refreshAttempts += 1;
    try {
      await refreshSession(getAccessToken());
    } catch (error) {
      if (started !== generation) return;
      // Session over (the refresh manager already cleared tokens and ended it): stop.
      if (error instanceof SessionEndedError || isRefreshRefused(error)) return;
      scheduleRetry();
      return;
    }
    if (started === generation) connectSocket(socket);
  };

  const handleAuthenticated = () => {
    attempt = 0;
    refreshAttempts = 0;
    onAuthenticated(true);
  };
  const handleDisconnect = (reason: string) => {
    onAuthenticated(false);
    if (reason === SERVER_DISCONNECT) scheduleRetry();
  };
  const handleConnectError = (error: Error) => {
    onAuthenticated(false);
    if (socket.active) return;
    if (error.message === HANDSHAKE_REJECTED && refreshAttempts < MAX_REFRESH_ATTEMPTS) {
      void recover();
    } else {
      scheduleRetry();
    }
  };

  const stop = () => {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    attempt = 0;
    refreshAttempts = 0;
  };

  socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
  socket.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);
  socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);

  return {
    stop,
    detach: () => {
      stop();
      socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      socket.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
      socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    },
  };
}
