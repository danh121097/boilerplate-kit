import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { io, type Socket } from "socket.io-client";

/** Trailing delay before a failed handshake is retried. */
const RECONNECT_THROTTLE_MS = 2000;

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

  function connectSocket() {
    socket.auth = buildAuth();
    if (socket.connected) {
      storeSocketIO.setSocketIO({ authenticated: true, socket });
      return;
    }
    socket.connect();
    storeSocketIO.setSocketIO({ authenticated: true, socket });
  }

  function destroySocket() {
    socket.disconnect();
    if (ioStore.value.socket === socket) {
      storeSocketIO.setSocketIO({ authenticated: false, socket: null });
    }
  }

  // Trailing timer: the first failure schedules one reconnect, further failures
  // inside the window are ignored.
  let reConnectTimer: ReturnType<typeof setTimeout> | null = null;
  function reConnect() {
    if (reConnectTimer) return;
    reConnectTimer = setTimeout(() => {
      reConnectTimer = null;
      destroySocket();
      connectSocket();
    }, RECONNECT_THROTTLE_MS);
  }

  const handleAuthenticated = () => storeSocketIO.setSocketIO({ authenticated: true, socket });
  const handleConnectError = (e: Error) => {
    if (e.message === SOCKET_UNAUTHORIZED_MESSAGE)
      storeSocketIO.setSocketIO({ authenticated: false });
    reConnect();
  };
  const onSocketUnauthorized = () => destroySocket();

  socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
  socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
  socket.on(SOCKET_EVENT.UNAUTHORIZED, onSocketUnauthorized);

  onMounted(connectSocket);

  onScopeDispose(() => {
    if (reConnectTimer) {
      clearTimeout(reConnectTimer);
      reConnectTimer = null;
    }
    socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
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
