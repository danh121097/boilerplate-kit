import { SOCKET_EVENT } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { io, type Socket } from "socket.io-client";

/** First retry delay after the server rejects the handshake; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Ceiling of the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

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
  const signature = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  if (!signature) return {};
  return { sig: signature.sig, ctime: signature.ctime };
}

/**
 * Initialize a socket.io connection scoped to the current component tree.
 *
 * Auth payload: `{ token: 'Bearer <access_token>', role: 'user' }`, plus `sig`/`ctime`
 * from `HMACSignatureGenerator` when `VITE_HMAC_SECRET` is set. Add extra claims
 * by spreading fields into the `auth` object below.
 */
export function useSocketIO() {
  const storeSocketIO = useSocketIOStore();

  const { ioStore } = storeToRefs(storeSocketIO);

  const URL = import.meta.env.VITE_APP_ENDPOINT || "";

  function buildAuth() {
    return { token: `Bearer ${getAccessToken() ?? ""}`, role: "user", ...signHeader() };
  }

  const socket = io(URL, {
    auth: buildAuth(),
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    forceBase64: true,
  });
  if (!ioStore.value.socket) storeSocketIO.setSocketIO({ socket });

  // `authenticated` flips to true only when the server emits AUTHENTICATED, so
  // connecting never sets it.
  function connectSocket() {
    socket.auth = buildAuth();
    if (!socket.connected) socket.connect();
  }

  function destroySocket() {
    clearRetry();
    socket.disconnect();
    if (ioStore.value.socket === socket) {
      storeSocketIO.setSocketIO({ authenticated: false, socket: null });
    }
  }

  // Backoff for a handshake the server rejected: one pending retry at a time,
  // 2s, 4s, 8s, 16s, then 30s. A network error is left to socket.io, which is
  // already reconnecting on its own (`socket.active`).
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function clearRetry() {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
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

/** Get the live socket from the store, lazy-init one if none exists yet. */
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
