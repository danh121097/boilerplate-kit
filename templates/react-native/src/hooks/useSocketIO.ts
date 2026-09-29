import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/** Minimum gap between automatic reconnect attempts after connect errors. */
const RECONNECT_THROTTLE_MS = 2000;

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
 * - Reconnect is throttled to avoid hammering the server on rapid errors.
 * - Exposes `socket`, `authenticated`, `connectSocket`, `destroySocket`.
 */
export function useSocketIO() {
  const URL = process.env.EXPO_PUBLIC_APP_ENDPOINT ?? "";

  // Throttle ref to prevent rapid reconnect storms.
  const reConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bumped by every connect and destroy: a connect whose auth read finishes after a
  // newer connect or a destroy (unmount, StrictMode remount) is stale and must not open the socket.
  const connectEpochRef = useRef(0);

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
    if (socket.connected) {
      setSocketIO({ authenticated: true, socket });
      return;
    }
    socket.connect();
    setSocketIO({ authenticated: true, socket });
  }, [socket, setSocketIO]);

  const destroySocket = useCallback(() => {
    connectEpochRef.current++;
    socket.disconnect();
    if (useSocketIOStore.getState().socket === socket) {
      setSocketIO({ authenticated: false, socket: null });
    }
  }, [socket, setSocketIO]);

  const reConnect = useCallback(() => {
    if (reConnectTimerRef.current) return;
    reConnectTimerRef.current = setTimeout(() => {
      reConnectTimerRef.current = null;
      destroySocket();
      void connectSocket();
    }, RECONNECT_THROTTLE_MS);
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
  const socket = useSocketIOStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, [socket, event, callback]);
}
