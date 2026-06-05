import { io, type Socket } from "socket.io-client";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";
import { getAuthToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";
import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";

/**
 * Initialize a socket.io connection scoped to the current component tree.
 *
 * SSR notes:
 * - `io()` constructor is safe on the server (lazy, no socket opened until `.connect()`).
 * - `getAuthToken()` returns null on the server (the underlying storage is SSR-guarded).
 * - `onMounted(connectSocket)` fires only on the client, so no WebSocket handshake
 *   happens during Nitro SSR rendering.
 *
 * Auth payload: `{ token: 'Bearer <localStorage.AUTH_TOKEN>', role: 'user', sig, ctime }`.
 *
 * SECURITY: signing in the browser requires exposing the secret via a PUBLIC
 * runtime config (`public.hmacSecret`). For production prefer signing in a Nitro
 * server route / BFF and forwarding the headers to the handshake.
 */
export function useSocketIO() {
  const storeSocketIO = useSocketIOStore();

  const { ioStore } = storeToRefs(storeSocketIO);

  const runtime = useRuntimeConfig();
  const URL = runtime.public.appEndpoint || "";
  const HMAC_SECRET = runtime.public.hmacSecret || "";

  /**
   * Per-handshake `{ sig, ctime }` headers the HMAC-protected backend expects:
   *   ["GET", "application/json", ctime, "/socket", ""].join("\n")  // Base64 HMAC
   * Empty object when no secret is configured (server then rejects).
   */
  function signHeader(): { sig: string; ctime: number } | Record<string, never> {
    if (!HMAC_SECRET) return {};
    const ctime = Date.now();
    const stringToSign = ["GET", "application/json", ctime, "/socket", ""].join("\n");
    return { sig: Base64.stringify(HmacSHA256(stringToSign, HMAC_SECRET)), ctime };
  }

  function buildAuth() {
    return { token: `Bearer ${getAuthToken() ?? ""}`, role: "user", ...signHeader() };
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

  const reConnect = useThrottleFn(() => {
    destroySocket();
    connectSocket();
  }, 2000);

  const handleAuthenticated = () => storeSocketIO.setSocketIO({ authenticated: true, socket });
  const handleConnectError = useThrottleFn((e: Error) => {
    if (e.message === SOCKET_UNAUTHORIZED_MESSAGE)
      storeSocketIO.setSocketIO({ authenticated: false });
    reConnect();
  }, 1000);
  const handleUnauthorized = () => destroySocket();

  socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
  socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
  socket.on(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);

  onMounted(connectSocket);

  onScopeDispose(() => {
    socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    socket.off(SOCKET_EVENT.UNAUTHORIZED, handleUnauthorized);
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
