import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";
import { useEffect, useRef, useCallback } from "react";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * Build the per-handshake `{ sig, ctime }` headers expected by HMAC-protected
 * backends. Returns an empty object when `NEXT_PUBLIC_HMAC_SECRET` is not set —
 * the server can then accept the bare bearer token alone (or reject).
 *
 * SECURITY: a `NEXT_PUBLIC_*` env var is exposed to every browser client.
 * Production deployments should sign on the server (a Route Handler or BFF proxy)
 * and forward the resulting headers to the socket handshake.
 */
function signHeader(): { sig: string; ctime: number } | Record<string, never> {
  const secret = process.env.NEXT_PUBLIC_HMAC_SECRET;
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
 * Initialize a socket.io connection scoped to the current component tree.
 *
 * Client-only: the hook guards `typeof window` before importing socket.io-client
 * so it is safe to reference from any client component without crashing SSR.
 * Mark consuming components with `"use client"`.
 *
 * Auth payload: `{ token: 'Bearer <access_token>', role: 'user' }` plus an
 * optional HMAC `{ sig, ctime }` when `NEXT_PUBLIC_HMAC_SECRET` is configured.
 *
 * Mirrors the Vue `useSocketIO` composable: connects on mount, cleans up on
 * unmount, auto-reconnects on `connect_error` with a 2 s throttle.
 */
export function useSocketIO() {
  const { socket, authenticated, setSocketIO } = useSocketIOStore();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectSocket = useCallback(() => {
    // SSR guard — socket.io-client accesses `window` internally
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

  // Initialise the socket instance once (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Lazy import ensures socket.io-client is never evaluated during SSR
    import("socket.io-client").then(({ io }) => {
      const existing = useSocketIOStore.getState().socket;
      if (existing) return; // already initialised by a previous mount

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
      // Throttled reconnect — at most once every 2 s
      if (reconnectTimer.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        destroySocket();
        // Re-init triggers the socket initialisation effect on next render
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
    // connectSocket / destroySocket are stable callbacks; socket reference is
    // the only reactive dependency that should re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  return {
    socket,
    authenticated,
    connectSocket,
    destroySocket,
  };
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
