import { io, type Socket } from "socket.io-client";
import { storeToRefs } from "pinia";
import { getAuthToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

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
  const secret = import.meta.env.VITE_HMAC_SECRET;
  if (!secret) return {};
  const ctime = Date.now();
  const stringToSign = ["GET", "application/json", ctime, "/socket", ""].join("\n");
  const sig = Base64.stringify(HmacSHA256(stringToSign, secret));
  return { sig, ctime };
}

/**
 * Initialize a socket.io connection scoped to the current component tree.
 *
 * Auth payload defaults to `{ token: 'Bearer <localStorage.AUTH_TOKEN>', role: 'user' }`.
 * Extend with HMAC signing or extra claims by spreading additional fields in
 * the `auth` object below — see `@/services/core/hmac-signature` for a ready-to-go
 * signer.
 */
export function useSocketIO() {
  const storeSocketIO = useSocketIOStore();
  const { ioStore } = storeToRefs(storeSocketIO);

  const URL = import.meta.env.VITE_APP_ENDPOINT ?? "http://localhost:3000";

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
    if (e.message === "Unauthorized!") storeSocketIO.setSocketIO({ authenticated: false });
    reConnect();
  }, 1000);
  const handleUnauthorized = () => destroySocket();

  socket.on("authenticated", handleAuthenticated);
  socket.on("connect_error", handleConnectError);
  socket.on("unauthorized", handleUnauthorized);

  onMounted(connectSocket);

  onScopeDispose(() => {
    socket.off("authenticated", handleAuthenticated);
    socket.off("connect_error", handleConnectError);
    socket.off("unauthorized", handleUnauthorized);
    destroySocket();
  });

  return {
    socket,
    authenticated: Boolean(ioStore.value.authenticated),
    connectSocket,
    destroySocket,
  };
}

/** Get the live socket from the store, lazy-initing one if none exists yet. */
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
