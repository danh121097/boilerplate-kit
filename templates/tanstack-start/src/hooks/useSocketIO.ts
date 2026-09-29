import { SOCKET_EVENT } from "@/enums";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";

/** First retry delay after the server rejects a handshake; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Upper bound of the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

function signHeader(): { sig: string; ctime: number } | Record<string, never> {
  const signed = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  if (!signed) return {};
  return { sig: signed.sig, ctime: signed.ctime };
}

function buildAuth() {
  return { role: "user", ...signHeader() };
}

export function useSocketIO() {
  const { socket, authenticated, setSocketIO } = useSocketIOStore();

  // Keep a ref to the socket so event-handler closures stay stable across renders.
  const socketRef = useRef(socket);

  // `authenticated` becomes true only when the server emits `authenticated`.
  const connectSocket = useCallback(() => {
    const sock = socketRef.current;
    if (!sock || sock.connected) return;
    sock.auth = buildAuth();
    sock.connect();
  }, []);

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
    // One pending manual retry at most, with exponential backoff between attempts.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    // Set once the socket exists; removes its listeners on unmount.
    let unbind: (() => void) | null = null;
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

      const handleAuthenticated = () => {
        attempt = 0;
        setSocketIO({ authenticated: true, socket: sock });
      };
      // Retry manually, once at a time, with a fresh auth payload.
      const scheduleRetry = () => {
        if (reconnectTimer) return;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attempt += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!cancelled) connectSocket();
        }, delay);
      };
      const handleDisconnect = (reason: string) => {
        setSocketIO({ authenticated: false });
        // socket.io never reconnects after the server closes the socket itself (e.g.
        // a graceful restart), so that case joins the same backoff as a rejected handshake.
        if (reason === SERVER_DISCONNECT) scheduleRetry();
      };
      const handleConnectError = () => {
        setSocketIO({ authenticated: false });
        // `active` means socket.io is already reconnecting (network error, server
        // down). Otherwise the server rejected the handshake.
        if (!sock.active) scheduleRetry();
      };
      const handleUnauthorized = () => destroySocket();

      sock.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      sock.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
      sock.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);
      sock.on(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);

      unbind = () => {
        sock.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
        sock.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
        sock.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
        sock.off(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);
      };

      connectSocket();
    });

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      unbind?.();
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
