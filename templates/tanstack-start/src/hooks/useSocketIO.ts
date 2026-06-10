import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect, useRef } from "react";
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

/**
 * Handshake auth payload. Auth is cookie-based: the httpOnly access-token cookie
 * is sent automatically on the WS upgrade (the socket is created with
 * `withCredentials: true`), so no token is placed here — only the role and the
 * optional HMAC signature.
 */
function buildAuth() {
  return { role: "user", ...signHeader() };
}

/**
 * React hook that manages a Socket.IO connection for the current component.
 *
 * Mirrors `useSocketIO` from the vuejs template, adapted for React + Zustand:
 * - Connects on mount via `useEffect` (client-only — effect never runs on server).
 * - Disconnects on unmount or when the component calling this hook is destroyed.
 * - Auth payload: `{ token: 'Bearer <access_token>', role: 'user' }` + optional HMAC sig.
 * - Re-connection is throttled: a new socket is not created if one already exists in the store.
 *
 * SSR safety: the entire body is inside a `typeof window !== "undefined"` guard
 * in `useEffect` (effects run client-only), and the dynamic `import('socket.io-client')`
 * ensures the browser bundle for socket.io-client is never evaluated during SSR render.
 */
export function useSocketIO() {
  const { socket, authenticated, setSocketIO } = useSocketIOStore();
  // Keep a ref to the socket so event-handler closures stay stable across renders.
  const socketRef = useRef(socket);

  const connectSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      setSocketIO({ authenticated: true });
      return;
    }
    if (socketRef.current) {
      socketRef.current.auth = buildAuth();
      socketRef.current.connect();
      setSocketIO({ authenticated: true });
    }
  }, [setSocketIO]);

  const destroySocket = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.disconnect();
    if (useSocketIOStore.getState().socket === socketRef.current) {
      setSocketIO({ authenticated: false, socket: null });
    }
    socketRef.current = null;
  }, [setSocketIO]);

  useEffect(() => {
    // SSR guard: effects only run in the browser, but belt-and-suspenders for
    // environments that polyfill useEffect on the server (e.g. React 18 streaming).
    if (typeof window === "undefined") return;

    // Lazy-import keeps socket.io-client out of the SSR bundle entirely.
    let cancelled = false;
    import("socket.io-client").then(({ io }) => {
      if (cancelled) return;

      const URL = import.meta.env.VITE_APP_ENDPOINT ?? "";
      const sock = io(URL, {
        auth: buildAuth(),
        transports: ["websocket"],
        withCredentials: true,
        autoConnect: false,
        forceBase64: true,
      });

      socketRef.current = sock;
      // Only write to store if no prior socket exists (avoids stomping a live connection).
      if (!useSocketIOStore.getState().socket) {
        setSocketIO({ socket: sock });
      }

      const handleAuthenticated = () => setSocketIO({ authenticated: true, socket: sock });
      const handleConnectError = (e: Error) => {
        if (e.message === SOCKET_UNAUTHORIZED_MESSAGE) {
          setSocketIO({ authenticated: false });
        }
        // Reconnect after a short delay — socket.io autoReconnect handles most
        // cases but explicit reconnect is needed for auth-rejected handshakes.
        setTimeout(() => {
          if (!cancelled) connectSocket();
        }, 2000);
      };
      const handleUnauthorized = () => destroySocket();

      sock.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      sock.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
      sock.on(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);

      connectSocket();

      return () => {
        sock.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
        sock.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
        sock.off(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);
      };
    });

    return () => {
      cancelled = true;
      destroySocket();
    };
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
 * Subscribe to a socket event with auto-cleanup on unmount.
 * Uses the live socket from the store — lazy-inits a connection if none exists yet.
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
