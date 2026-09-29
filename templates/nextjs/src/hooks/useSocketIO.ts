import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect } from "react";

/** Trailing delay before a failed handshake is retried. */
const RECONNECT_THROTTLE_MS = 2000;

/** Handshake signature, built by the same signer as the HTTP requests. Empty when
 * no HMAC secret is configured. */
function signHeader(): { sig?: string; ctime?: number } {
  const signed = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  return signed ? { sig: signed.sig, ctime: signed.ctime } : {};
}

function buildAuth() {
  return { role: "user", ...signHeader() };
}

export function useSocketIO() {
  const { socket, authenticated, setSocketIO } = useSocketIOStore();

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

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleAuthenticated = () => setSocketIO({ authenticated: true });
    // Any failed handshake schedules ONE trailing retry that reconnects the same
    // socket with a fresh signature (`connectSocket` rebuilds `auth`).
    const handleConnectError = (e: Error) => {
      if (e.message === SOCKET_UNAUTHORIZED_MESSAGE) {
        setSocketIO({ authenticated: false });
      }
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSocket();
      }, RECONNECT_THROTTLE_MS);
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
      // Cancel a pending retry so nothing connects after unmount.
      if (reconnectTimer) clearTimeout(reconnectTimer);
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
  const socket = useSocketIOStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, [socket, event, callback]);
}
