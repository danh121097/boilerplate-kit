import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * Build the per-handshake `{ sig, ctime }` headers expected by HMAC-protected
 * backends. Returns an empty object when `VITE_HMAC_SECRET` is not set — the
 * server can then accept the bare bearer token alone (or reject).
 *
 * SECURITY: a `VITE_*` env var is exposed to every browser client. Production
 * deployments should sign on the server (a dedicated API route or a BFF
 * proxy) and forward the resulting headers to the socket handshake.
 */
function signHeader(): { sig: string; ctime: number } | Record<string, never> {
  const secret = import.meta.env.VITE_HMAC_SECRET;
  if (!secret) return {};
  const ctime = Date.now();
  const stringToSign = ["GET", "application/json", ctime, "/socket", ""].join("\n");
  const sig = Base64.stringify(HmacSHA256(stringToSign, secret));
  return { sig, ctime };
}

function buildAuth() {
  return { token: `Bearer ${getAccessToken() ?? ""}`, role: "user", ...signHeader() };
}

/**
 * Initialize a socket.io connection scoped to the mounting component.
 *
 * Mirrors the vuejs `useSocketIO` composable:
 * - Connects on mount, disconnects on unmount.
 * - Auth payload: `{ token: 'Bearer <ACCESS_TOKEN>', role: 'user', ...HMACHeaders }`.
 * - Reconnect is throttled to avoid hammering the server on rapid errors.
 * - Exposes `socket`, `authenticated`, `connectSocket`, `destroySocket`.
 */
export function useSocketIO() {
  const { setSocketIO, authenticated } = useSocketIOStore();
  const socketRef = useRef<Socket | null>(null);

  const URL = import.meta.env.VITE_APP_ENDPOINT ?? "";

  // Lazily create the socket instance once per hook mount.
  if (!socketRef.current) {
    socketRef.current = io(URL, {
      auth: buildAuth(),
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: false,
      forceBase64: true,
    });
    // Register in the store only when the store slot is empty (first mount).
    if (!useSocketIOStore.getState().socket) {
      setSocketIO({ socket: socketRef.current });
    }
  }

  const socket = socketRef.current;

  const connectSocket = useCallback(() => {
    socket.auth = buildAuth();
    if (socket.connected) {
      setSocketIO({ authenticated: true, socket });
      return;
    }
    socket.connect();
    setSocketIO({ authenticated: true, socket });
  }, [socket, setSocketIO]);

  const destroySocket = useCallback(() => {
    socket.disconnect();
    if (useSocketIOStore.getState().socket === socket) {
      setSocketIO({ authenticated: false, socket: null });
    }
  }, [socket, setSocketIO]);

  // Throttle ref to prevent rapid reconnect storms (mirrors vuejs useThrottleFn).
  const reConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reConnect = useCallback(() => {
    if (reConnectTimerRef.current) return;
    reConnectTimerRef.current = setTimeout(() => {
      reConnectTimerRef.current = null;
      destroySocket();
      connectSocket();
    }, 2000);
  }, [connectSocket, destroySocket]);

  useEffect(() => {
    const handleAuthenticated = () => setSocketIO({ authenticated: true, socket });
    const handleConnectError = (e: Error) => {
      if (e.message === SOCKET_UNAUTHORIZED_MESSAGE) setSocketIO({ authenticated: false });
      reConnect();
    };
    const handleUnauthorized = () => destroySocket();

    socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    socket.on(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);

    connectSocket();

    return () => {
      socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
      socket.off(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);
      destroySocket();
      if (reConnectTimerRef.current) {
        clearTimeout(reConnectTimerRef.current);
        reConnectTimerRef.current = null;
      }
    };
    // connectSocket/destroySocket/reConnect are stable callbacks — safe to omit
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
 * Mirrors the vuejs `useSocketEvent` composable.
 */
export function useSocketEvent(event: string, callback: (...args: unknown[]) => void) {
  const { socket } = useSocketIOStore.getState();
  useEffect(() => {
    if (!socket) return;
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, [socket, event, callback]);
}
