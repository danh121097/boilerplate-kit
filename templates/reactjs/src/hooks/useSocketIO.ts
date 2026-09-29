import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { io, type Socket } from "socket.io-client";

/** Trailing delay before a failed handshake is retried. */
const RECONNECT_THROTTLE_MS = 2000;

/**
 * Build the per-handshake `{ sig, ctime }` headers expected by HMAC-protected
 * backends, signed by the same generator as the HTTP requests. Returns an empty
 * object when `VITE_HMAC_SECRET` is not set — the server can then accept the
 * bare bearer token alone (or reject).
 *
 * SECURITY: a `VITE_*` env var is exposed to every browser client. Production
 * deployments should sign on the server (a dedicated API route or a BFF
 * proxy) and forward the resulting headers to the socket handshake.
 */
function signHeader(): { sig: string; ctime: number } | Record<string, never> {
  const signed = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  return signed ? { sig: signed.sig, ctime: signed.ctime } : {};
}

function buildAuth() {
  return { token: `Bearer ${getAccessToken() ?? ""}`, role: "user", ...signHeader() };
}

/** Re-sign the handshake payload so a (re)connect carries the current token. */
function refreshAuth(socket: Socket) {
  socket.auth = buildAuth();
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
  const URL = import.meta.env.VITE_APP_ENDPOINT ?? "";

  // Trailing timer: the first failure schedules one reconnect, later failures
  // inside the window are dropped, so rapid errors cannot cause a reconnect storm.
  const reConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { authenticated, setSocketIO } = useSocketIOStore();

  // One socket instance per hook mount (the lazy initializer runs once).
  const [socket] = useState(() =>
    io(URL, {
      auth: buildAuth(),
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: false,
      forceBase64: true,
    }),
  );

  const connectSocket = useCallback(() => {
    refreshAuth(socket);
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
  const reConnect = useCallback(() => {
    if (reConnectTimerRef.current) return;
    reConnectTimerRef.current = setTimeout(() => {
      reConnectTimerRef.current = null;
      destroySocket();
      connectSocket();
    }, RECONNECT_THROTTLE_MS);
  }, [connectSocket, destroySocket]);

  useEffect(() => {
    const handleAuthenticated = () => setSocketIO({ authenticated: true, socket });
    const handleConnectError = (e: Error) => {
      if (e.message === SOCKET_UNAUTHORIZED_MESSAGE) setSocketIO({ authenticated: false });
      reConnect();
    };
    const handleUnauthorized = () => destroySocket();

    // Register in the store only when the slot is empty (first mount).
    if (!useSocketIOStore.getState().socket) setSocketIO({ socket });

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
  }, [socket, setSocketIO, connectSocket, destroySocket, reConnect]);

  return {
    socket,
    authenticated,
    connectSocket,
    destroySocket,
  };
}

/**
 * Subscribe to a socket event with automatic cleanup on unmount.
 * Reads the live socket reactively, so it rebinds when the socket changes.
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
