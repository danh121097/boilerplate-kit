import { SOCKET_EVENT } from "@/enums";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { io, type Socket } from "socket.io-client";

/** First delay before retrying a handshake the server rejected; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Ceiling of the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

export function useSocketIO() {
  const storeSocketIO = useSocketIOStore();

  const runtime = useRuntimeConfig();

  const { ioStore } = storeToRefs(storeSocketIO);
  const URL = runtime.public.appEndpoint || "";

  function signHeader() {
    const sig = HMACSignatureGenerator.signRequest({
      method: "GET",
      path: "/socket",
      contentType: "application/json",
    });
    if (!sig) return {};
    return { sig: sig.sig, ctime: sig.ctime };
  }

  /** Cookie-only auth — no Bearer. The browser sends the httpOnly access-token
   * cookie via the `withCredentials` socket option. */
  function buildAuth() {
    return { role: "user", ...signHeader() };
  }

  const socket = io(URL, {
    auth: buildAuth(),
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    forceBase64: true,
  });
  if (!ioStore.value.socket) storeSocketIO.setSocketIO({ socket });

  // Only the server's `authenticated` event marks the connection authenticated;
  // opening the transport says nothing about the handshake result.
  function connectSocket() {
    socket.auth = buildAuth();
    if (socket.connected) return;
    socket.connect();
  }

  // Manual retry after a rejected handshake: one pending timer at a time, the
  // delay doubling from RECONNECT_BASE_MS up to RECONNECT_MAX_MS. Network errors
  // are left to socket.io's own reconnection (`socket.active`).
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function destroySocket() {
    clearRetry();
    socket.disconnect();
    if (ioStore.value.socket === socket) {
      storeSocketIO.setSocketIO({ authenticated: false, socket: null });
    }
  }

  function scheduleRetry() {
    if (retryTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt++;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectSocket();
    }, delay);
  }

  const handleAuthenticated = () => {
    attempt = 0;
    storeSocketIO.setSocketIO({ authenticated: true, socket });
  };
  const handleDisconnect = (reason: string) => {
    storeSocketIO.setSocketIO({ authenticated: false });
    // socket.io never reconnects after the server closes the socket itself (e.g. a
    // graceful restart), so that case joins the same backoff as a rejected handshake.
    if (reason === SERVER_DISCONNECT) scheduleRetry();
  };
  const handleConnectError = () => {
    storeSocketIO.setSocketIO({ authenticated: false });
    if (!socket.active) scheduleRetry();
  };
  const onSocketUnauthorized = () => destroySocket();

  socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
  socket.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);
  socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
  socket.on(SOCKET_EVENT.UNAUTHORIZED, onSocketUnauthorized);

  onMounted(connectSocket);

  onScopeDispose(() => {
    socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
    socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    socket.off(SOCKET_EVENT.UNAUTHORIZED, onSocketUnauthorized);
    destroySocket();
  });

  return {
    socket,
    authenticated: Boolean(ioStore.value.authenticated),
    connectSocket,
    destroySocket,
  };
}

/** Get the live socket from the store, lazy initializing one if none exists yet. */
export function useIo() {
  const storeSocketIO = useSocketIOStore();

  const { ioStore } = storeToRefs(storeSocketIO);

  if (!ioStore.value.socket) {
    const { socket, authenticated } = useSocketIO();
    return { socket, authenticated };
  }
  return {
    socket: ioStore.value.socket as Socket,
    authenticated: ioStore.value.authenticated,
  };
}

/** Subscribe to a socket event with auto cleanup on component unmount. */
export function useSocketEvent(event: string, callback: (...args: unknown[]) => void) {
  const { socket } = useIo();
  onMounted(() => socket.on(event, callback));
  onBeforeUnmount(() => socket.off(event, callback));
}
