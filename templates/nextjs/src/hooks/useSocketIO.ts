import { SOCKET_EVENT } from "@/enums";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect } from "react";

/** First delay before a rejected handshake is retried; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Ceiling for the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

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
  const connectSocket = useCallback(() => {
    if (typeof window === "undefined") return;

    const currentSocket = useSocketIOStore.getState().socket;
    if (!currentSocket) return;

    currentSocket.auth = buildAuth();
    // `authenticated` flips only on the server's `authenticated` event.
    if (!currentSocket.connected) currentSocket.connect();
  }, []);

  const { socket, authenticated, setSocketIO } = useSocketIOStore();

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
    let attempt = 0;

    const handleAuthenticated = () => {
      attempt = 0;
      setSocketIO({ authenticated: true });
    };
    // ONE manual retry at a time on the same socket (`connectSocket` rebuilds `auth`)
    // with exponential backoff.
    const scheduleRetry = () => {
      if (reconnectTimer) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      attempt++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSocket();
      }, delay);
    };
    const handleDisconnect = (reason: string) => {
      setSocketIO({ authenticated: false });
      // socket.io never reconnects after the server closes the socket itself (e.g. a
      // graceful restart), so that case joins the same backoff as a rejected handshake.
      if (reason === SERVER_DISCONNECT) scheduleRetry();
    };
    const handleConnectError = () => {
      setSocketIO({ authenticated: false });
      // `active` means socket.io is already auto-reconnecting (network error, server
      // down). Otherwise the server rejected the handshake.
      if (!socket.active) scheduleRetry();
    };
    const handleUnauthorized = () => destroySocket();

    socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);
    socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    socket.on(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);

    connectSocket();

    return () => {
      socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      socket.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
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
