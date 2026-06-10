import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { useSocketIOStore } from "@/stores/socket-io";
import { useEffect, useRef, useCallback } from "react";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * Build the per-handshake HMAC `{ sig, ctime }` headers expected by the backend.
 * Returns an empty object when `NEXT_PUBLIC_HMAC_SECRET` is not set.
 */
function signHeader(): { sig: string; ctime: number } | Record<string, never> {
  const secret = process.env.NEXT_PUBLIC_HMAC_SECRET;
  if (!secret) return {};
  const ctime = Date.now();
  // The socket handshake is verified against a fixed "application/json" content-type
  // (express socket/hmac-middleware), NOT the empty "" used for axios HTTP GETs.
  const stringToSign = ["GET", "application/json", ctime, "/socket", ""].join("\n");
  const sig = Base64.stringify(HmacSHA256(stringToSign, secret));
  return { sig, ctime };
}

/**
 * Auth payload for the socket handshake — cookie-only (no Bearer token).
 * The httpOnly access-token cookie is sent automatically via `withCredentials`.
 */
function buildAuth() {
  return { role: "user", ...signHeader() };
}

/**
 * Socket.io connection scoped to the component tree. Client-only (guards
 * `typeof window` before importing socket.io-client; mark consumers "use client").
 * Cookie handshake (`withCredentials`) — no Bearer in JS; connects on mount, cleans
 * up on unmount, auto-reconnects on `connect_error` (2s throttle).
 */
export function useSocketIO() {
  const { socket, authenticated, setSocketIO } = useSocketIOStore();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectSocket = useCallback(() => {
    if (typeof window === "undefined") return;

    const currentSocket = useSocketIOStore.getState().socket;
    if (!currentSocket) return;

    currentSocket.auth = buildAuth();
    if (currentSocket.connected) {
      setSocketIO({ authenticated: true });
      return;
    }
    currentSocket.connect();
    setSocketIO({ authenticated: true });
  }, [setSocketIO]);

  const destroySocket = useCallback(() => {
    const currentSocket = useSocketIOStore.getState().socket;
    if (!currentSocket) return;
    currentSocket.disconnect();
    setSocketIO({ authenticated: false, socket: null });
  }, [setSocketIO]);

  // Initialize the socket instance once (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    import("socket.io-client").then(({ io }) => {
      const existing = useSocketIOStore.getState().socket;
      if (existing) return;

      const url = process.env.NEXT_PUBLIC_APP_ENDPOINT ?? "";
      const newSocket = io(url, {
        auth: buildAuth(),
        transports: ["websocket"],
        withCredentials: true,
        autoConnect: false,
        forceBase64: true,
      });
      setSocketIO({ socket: newSocket });
    });
  }, [setSocketIO]);

  // Attach event handlers and connect once the socket is ready
  useEffect(() => {
    if (!socket) return;

    const handleAuthenticated = () => setSocketIO({ authenticated: true });

    const handleConnectError = (e: Error) => {
      if (e.message === SOCKET_UNAUTHORIZED_MESSAGE) {
        setSocketIO({ authenticated: false });
      }
      if (reconnectTimer.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        destroySocket();
      }, 2000);
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
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      destroySocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  return { socket, authenticated, connectSocket, destroySocket };
}

/**
 * Subscribe to a socket event with auto-cleanup on component unmount.
 * Requires the consuming component to be a client component (`"use client"`).
 */
export function useSocketEvent(event: string, callback: (...args: unknown[]) => void) {
  const { socket } = useSocketIOStore();

  useEffect(() => {
    if (!socket) return;
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, [socket, event, callback]);
}
