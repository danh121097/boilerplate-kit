import { SOCKET_EVENT } from "@/enums";
import { getApiOrigin } from "@/services/core/api-config";
import { isRefreshRefused, SessionEndedError } from "@/services/core/api-errors";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { refreshSession } from "@/services/core/server-session";
import { useSocketIOStore } from "@/stores/socket-io";

/** First retry delay after the server rejects a handshake; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Upper bound of the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Consecutive session refreshes tried per outage before falling back to plain backoff. */
const MAX_REFRESH_ATTEMPTS = 3;
/** `connect_error` message the server sends when it rejects a handshake. */
const SOCKET_UNAUTHORIZED = "Unauthorized!";
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

/** Handshake payload, signed fresh. Auth is the httpOnly cookie, so no `token` is sent. */
function buildAuth() {
  return signHeader();
}

export function useSocketIO() {
  // Cancels the retry timer and any in-flight refresh recovery of the live effect.
  const stopRecoveryRef = useRef<(() => void) | null>(null);

  const { socket, authenticated, setSocketIO } = useSocketIOStore();

  // Keep a ref to the socket so event-handler closures stay stable across renders.
  const socketRef = useRef(socket);

  // `authenticated` becomes true only when the server emits `authenticated`.
  const connectSocket = useCallback(() => {
    const sock = socketRef.current;
    if (!sock || sock.connected) return;
    sock.connect();
  }, []);

  const destroySocket = useCallback(() => {
    // A refresh still in flight must not reconnect the socket destroyed here.
    stopRecoveryRef.current?.();
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
    // Consecutive session refreshes tried since the socket was last authenticated.
    let refreshAttempts = 0;
    // Set once the socket exists; removes its listeners on unmount.
    let unbind: (() => void) | null = null;
    stopRecoveryRef.current = () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };
    import("socket.io-client").then(({ io }) => {
      if (cancelled) return;

      const sock = io(getApiOrigin(), {
        // Callback form: every (re)connect is signed anew (fresh `ctime`).
        auth: (cb) => cb(buildAuth()),
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
        refreshAttempts = 0;
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
      // The server rejected the handshake: refresh the session once, then reconnect
      // with the rotated cookie. Refused → the session is over (the refresh manager
      // ended it), stop. Transient → keep the backoff. A bounded number of
      // consecutive refreshes per outage, then plain backoff (fresh signature each try).
      const refreshThenReconnect = async () => {
        refreshAttempts += 1;
        try {
          await refreshSession();
        } catch (error) {
          if (cancelled) return;
          if (error instanceof SessionEndedError || isRefreshRefused(error)) {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = null;
            sock.disconnect();
            return;
          }
          scheduleRetry();
          return;
        }
        if (!cancelled) sock.connect();
      };
      const handleConnectError = (error: Error) => {
        setSocketIO({ authenticated: false });
        // `active` means socket.io is already reconnecting (network error, server
        // down). Otherwise the server rejected the handshake.
        if (sock.active) return;
        if (error.message === SOCKET_UNAUTHORIZED && refreshAttempts < MAX_REFRESH_ATTEMPTS) {
          void refreshThenReconnect();
        } else {
          scheduleRetry();
        }
      };

      sock.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      sock.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
      sock.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);

      unbind = () => {
        sock.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
        sock.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
        sock.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
      };

      connectSocket();
    });

    return () => {
      stopRecoveryRef.current?.();
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
