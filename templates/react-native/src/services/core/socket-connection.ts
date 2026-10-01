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

type SocketAuth = { token?: string; sig?: string; ctime?: number };

/**
 * Build the per-handshake `{ sig, ctime }` expected by HMAC-protected backends,
 * signed by the same generator as the HTTP requests. Empty when
 * `EXPO_PUBLIC_HMAC_SECRET` is not set — the server can then accept the bare
 * bearer token alone (or reject).
 *
 * SECURITY: an `EXPO_PUBLIC_*` var is inlined into the shipped bundle. Production
 * apps should sign on the server (a BFF/proxy) and forward the headers.
 */
function signHeader(): { sig?: string; ctime?: number } {
  const signed = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  return signed ? { sig: signed.sig, ctime: signed.ctime } : {};
}

/**
 * Handshake payload: `token` only when signed in (never an empty `Bearer`), plus a
 * fresh signature. The access token is read asynchronously from SecureStore.
 */
export async function buildAuth(): Promise<SocketAuth> {
  const token = await getAccessToken();
  return { ...(token ? { token: `Bearer ${token}` } : {}), ...signHeader() };
}

/**
 * Create the (not yet connected) socket against `getApiOrigin()`. `auth` is
 * the callback form, so every connect and reconnect is signed afresh with the
 * current token and a new `ctime`. When the SecureStore read fails the handshake
 * goes out empty: the backend rejects it with `"Unauthorized!"`, which surfaces as
 * a `connect_error` handled by the lifecycle (refresh, then backoff) instead of
 * leaving the handshake hanging.
 */
export function createSocket(): Socket {
  return io(getApiOrigin(), {
    auth: (cb) => {
      buildAuth().then(cb, () => cb({}));
    },
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    forceBase64: true,
  });
}

/**
 * Connect unless already connected or signed out (no access token → nothing to
 * authenticate). Resolves to whether a connection was started or already open.
 * `isStale` is checked once the async token read settles, so a connect overtaken
 * by an unmount or a newer connect does not open the socket.
 */
export async function connectSocket(socket: Socket, isStale?: () => boolean): Promise<boolean> {
  const token = await getAccessToken();
  if (!token || isStale?.()) return false;
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
  // Bumped by `stop` so a recovery or connect still awaiting SecureStore / the
  // refresh does not reconnect.
  let generation = 0;

  const scheduleRetry = () => {
    if (timer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt += 1;
    const started = generation;
    timer = setTimeout(() => {
      timer = null;
      void connectSocket(socket, () => started !== generation);
    }, delay);
  };

  const recover = async () => {
    const started = generation;
    const isStale = () => started !== generation;
    try {
      if (!(await hasStoredSession()) || isStale()) return;
      refreshAttempts += 1;
      await refreshSession(await getAccessToken());
    } catch (error) {
      if (isStale()) return;
      // Session over (the refresh manager already cleared tokens and ended it): stop.
      if (error instanceof SessionEndedError || isRefreshRefused(error)) return;
      scheduleRetry();
      return;
    }
    if (!isStale()) await connectSocket(socket, isStale);
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
