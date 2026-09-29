import { SOCKET_EVENT } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/** First delay before retrying a handshake the server rejected; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Upper bound of the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

/**
 * Build the per-handshake `{ sig, ctime }` headers expected by HMAC-protected
 * backends. Returns an empty object when `EXPO_PUBLIC_HMAC_SECRET` is not set.
 *
 * SECURITY: an `EXPO_PUBLIC_*` var is inlined into the shipped bundle. Production
 * apps should sign on the server (a BFF/proxy) and forward the headers.
 */
function signHeader(): { sig: string; ctime: number } | Record<string, never> {
  const signed = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  if (!signed) return {};
  return { sig: signed.sig, ctime: signed.ctime };
}

/**
 * Build the socket handshake auth payload. Unlike the web template the access
 * token is read asynchronously from SecureStore, so this is `async` and must be
 * awaited before connecting.
 */
export async function buildSocketAuth() {
  const token = await getAccessToken();
  return { token: `Bearer ${token ?? ""}`, role: "user", ...signHeader() };
}

/** Attach a fresh handshake payload (the token may have rotated since the last connect). */
async function refreshAuth(socket: Socket): Promise<void> {
  socket.auth = await buildSocketAuth();
}

/**
 * Initialize a socket.io connection scoped to the mounting component.
 *
 * - Connects on mount, disconnects on unmount.
 * - Auth payload: `{ token: 'Bearer <ACCESS_TOKEN>', role: 'user', ...HMACHeaders }`
 *   (the token is resolved asynchronously from SecureStore).
 * - `authenticated` becomes true only when the server emits `authenticated`; it is
 *   false after `connect_error`, `disconnect` and destroy.
 * - A rejected handshake (`socket.active` false) is retried on the same socket with
 *   exponential backoff (`RECONNECT_BASE_MS` doubling up to `RECONNECT_MAX_MS`), one
 *   pending retry at a time, with fresh auth. While socket.io is auto-reconnecting
 *   (`socket.active` true, e.g. server down) nothing extra is scheduled.
 * - Exposes `socket`, `authenticated`, `connectSocket`, `destroySocket`.
 */
export function useSocketIO() {
  const URL = process.env.EXPO_PUBLIC_APP_ENDPOINT ?? "";

  // Pending manual retry (at most one) and how many retries were scheduled since the last success.
  const reConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  // Bumped by every connect and destroy: a connect whose auth read finishes after a
  // newer connect or a destroy (unmount, StrictMode remount) is stale and must not open the socket.
  const connectEpochRef = useRef(0);

  const clearRetry = useCallback(() => {
    if (reConnectTimerRef.current) {
      clearTimeout(reConnectTimerRef.current);
      reConnectTimerRef.current = null;
    }
  }, []);

  const { authenticated, setSocketIO } = useSocketIOStore();

  // One socket instance per hook mount (the lazy initializer runs once). No auth
  // yet: the token is attached asynchronously in connectSocket.
  const [socket] = useState(() =>
    io(URL, {
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: false,
      forceBase64: true,
    }),
  );

  const connectSocket = useCallback(async () => {
    const epoch = ++connectEpochRef.current;
    await refreshAuth(socket);
    if (epoch !== connectEpochRef.current) return;
    // `authenticated` stays false until the server confirms it.
    setSocketIO({ socket });
    if (!socket.connected) socket.connect();
  }, [socket, setSocketIO]);

  const destroySocket = useCallback(() => {
    connectEpochRef.current++;
    clearRetry();
    attemptRef.current = 0;
    socket.disconnect();
    if (useSocketIOStore.getState().socket === socket) {
      setSocketIO({ authenticated: false, socket: null });
    }
  }, [socket, setSocketIO, clearRetry]);

  // The server rejected the handshake: retry once after an exponentially growing delay.
  const scheduleRetry = useCallback(() => {
    if (reConnectTimerRef.current) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
    attemptRef.current++;
    reConnectTimerRef.current = setTimeout(() => {
      reConnectTimerRef.current = null;
      void connectSocket();
    }, delay);
  }, [connectSocket]);

  useEffect(() => {
    const handleAuthenticated = () => {
      attemptRef.current = 0;
      setSocketIO({ authenticated: true, socket });
    };
    const handleConnectError = () => {
      setSocketIO({ authenticated: false });
      // socket.io is already retrying by itself while `active`; only a rejected handshake needs us.
      if (!socket.active) scheduleRetry();
    };
    const handleDisconnect = (reason: string) => {
      setSocketIO({ authenticated: false });
      // socket.io never reconnects after the server closes the socket itself (e.g. a
      // graceful restart), so that case joins the same backoff as a rejected handshake.
      if (reason === SERVER_DISCONNECT) scheduleRetry();
    };
    const handleUnauthorized = () => destroySocket();

    socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    socket.on(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);
    socket.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);

    void connectSocket();

    return () => {
      socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
      socket.off(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);
      socket.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
      destroySocket();
    };
    // connectSocket/destroySocket/scheduleRetry are stable callbacks — safe to omit
    // from the dep array to prevent reconnection on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    socket,
    authenticated,
    connectSocket,
    destroySocket,
  };
}

/**
 * Subscribe to a socket event with automatic cleanup on unmount.
 */
export function useSocketEvent(event: string, callback: (...args: unknown[]) => void) {
  const socket = useSocketIOStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, [socket, event, callback]);
}
