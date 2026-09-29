import { SOCKET_EVENT, SOCKET_UNAUTHORIZED_MESSAGE } from "@/enums";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { useSocketIOStore } from "@/stores/socket-io";
import { io, type Socket } from "socket.io-client";

/** Delay before a failed connection is retried; errors inside it share one retry. */
const RECONNECT_THROTTLE_MS = 2000;

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

  // Trailing timer: the first error schedules one reconnect, later errors inside
  // the window share it, so a burst of errors cannot cause a reconnect storm.
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
    socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    socket.off(SOCKET_EVENT.UNAUTHORIZED, onSocketUnauthorized);
    if (reConnectTimer) clearTimeout(reConnectTimer);
    reConnectTimer = null;
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
