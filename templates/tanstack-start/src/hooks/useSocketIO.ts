import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";

/** Delay before a failed connection is retried; errors inside it share one retry. */
const RECONNECT_THROTTLE_MS = 2000;

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
    // Trailing timer: the first error schedules one reconnect, later errors inside
    // the window share it, so a burst of errors cannot cause a reconnect storm.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!cancelled) connectSocket();
        }, RECONNECT_THROTTLE_MS);
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
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
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
