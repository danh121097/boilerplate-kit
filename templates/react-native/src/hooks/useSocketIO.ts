import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * Build the per-handshake `{ sig, ctime }` headers expected by HMAC-protected
 * backends. Returns an empty object when `EXPO_PUBLIC_HMAC_SECRET` is not set.
 *
 * SECURITY: an `EXPO_PUBLIC_*` var is inlined into the shipped bundle. Production
 * apps should sign on the server (a BFF/proxy) and forward the headers.
 */
function signHeader(): { sig: string; ctime: number } | Record<string, never> {
  const secret = process.env.EXPO_PUBLIC_HMAC_SECRET;
  if (!secret) return {};
  const ctime = Date.now();
  const stringToSign = ["GET", "application/json", ctime, "/socket", ""].join("\n");
  const sig = Base64.stringify(HmacSHA256(stringToSign, secret));
  return { sig, ctime };
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

/**
 * Initialize a socket.io connection scoped to the mounting component.
 *
 * - Connects on mount, disconnects on unmount.
 * - Auth payload: `{ token: 'Bearer <ACCESS_TOKEN>', role: 'user', ...HMACHeaders }`
 *   (the token is resolved asynchronously from SecureStore).
 * - Reconnect is throttled to avoid hammering the server on rapid errors.
 * - Exposes `socket`, `authenticated`, `connectSocket`, `destroySocket`.
 */
export function useSocketIO() {
  const socketRef = useRef<Socket | null>(null);

  const URL = process.env.EXPO_PUBLIC_APP_ENDPOINT ?? "";

  const { authenticated, setSocketIO } = useSocketIOStore();

  // Lazily create the socket instance once per hook mount (no auth yet — the
  // token is attached asynchronously in connectSocket).
  if (!socketRef.current) {
    socketRef.current = io(URL, {
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: false,
      forceBase64: true,
    });
    if (!useSocketIOStore.getState().socket) {
      setSocketIO({ socket: socketRef.current });
    }
  }

  const socket = socketRef.current;

  const connectSocket = useCallback(async () => {
    socket.auth = await buildSocketAuth();
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

  // Throttle ref to prevent rapid reconnect storms.
  const reConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reConnect = useCallback(() => {
    if (reConnectTimerRef.current) return;
    reConnectTimerRef.current = setTimeout(() => {
      reConnectTimerRef.current = null;
      destroySocket();
      void connectSocket();
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

    void connectSocket();

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
