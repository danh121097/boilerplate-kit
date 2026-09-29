import { SOCKET_EVENT } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { io, type Socket } from "socket.io-client";

/** First retry delay after the server rejects a handshake; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Ceiling of the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

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
 * - Connects on mount, disconnects on unmount.
 * - Auth payload: `{ token: 'Bearer <ACCESS_TOKEN>', role: 'user', ...HMACHeaders }`.
 * - `authenticated` turns true only when the server emits `authenticated`, and
 *   false on `connect_error`, `disconnect` and destroy.
 * - A handshake the server rejects (`socket.active` false) is retried on the same
 *   socket with exponential backoff (`RECONNECT_BASE_MS` doubling up to
 *   `RECONNECT_MAX_MS`) and a re-signed payload; while socket.io is already
 *   auto-reconnecting (`socket.active` true) nothing extra is scheduled.
 * - Exposes `socket`, `authenticated`, `connectSocket`, `destroySocket`.
 */
export function useSocketIO() {
  const URL = import.meta.env.VITE_APP_ENDPOINT ?? "";

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

  // Pending manual retry (at most one); cleared by destroy so nothing reconnects after it.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectSocket = useCallback(() => {
    refreshAuth(socket);
    if (!socket.connected) socket.connect();
    setSocketIO({ socket });
  }, [socket, setSocketIO]);

  const destroySocket = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    socket.disconnect();
    if (useSocketIOStore.getState().socket === socket) {
      setSocketIO({ authenticated: false, socket: null });
    }
  }, [socket, setSocketIO]);

  useEffect(() => {
    let attempt = 0;

    const handleAuthenticated = () => {
      attempt = 0;
      setSocketIO({ authenticated: true, socket });
    };
    // One manual retry at a time, backing off, with a re-signed payload.
    const scheduleRetry = () => {
      if (retryTimerRef.current) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      attempt += 1;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        refreshAuth(socket);
        socket.connect();
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
      // socket.io is already auto-reconnecting (network error, server down); otherwise
      // the server rejected the handshake.
      if (!socket.active) scheduleRetry();
    };
    const handleUnauthorized = () => destroySocket();

    // Register in the store only when the slot is empty (first mount).
    if (!useSocketIOStore.getState().socket) setSocketIO({ socket });

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
      destroySocket();
    };
  }, [socket, setSocketIO, connectSocket, destroySocket]);

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
