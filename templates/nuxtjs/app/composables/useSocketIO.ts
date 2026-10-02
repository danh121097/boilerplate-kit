import { SOCKET_EVENT } from "@/enums";
import { getApiOrigin } from "@/services/core/api-config";
import { HMAC_ERROR_TYPE, isRefreshRefused, SessionEndedError } from "@/services/core/api-errors";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { refreshSession } from "@/services/core/interceptors";
import { useSocketIOStore } from "@/stores/socket-io";
import { io, type Socket } from "socket.io-client";

/** First delay before retrying a handshake the server rejected; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Ceiling of the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Consecutive session refreshes tried per outage before falling back to plain backoff. */
const MAX_REFRESH_ATTEMPTS = 3;
/** `connect_error` message the server sends when it rejects a handshake. */
const SOCKET_UNAUTHORIZED = "Unauthorized!";
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

export function useSocketIO() {
  const storeSocketIO = useSocketIOStore();

  const { ioStore } = storeToRefs(storeSocketIO);

  function signHeader() {
    const sig = HMACSignatureGenerator.signRequest({
      method: "GET",
      path: "/socket",
      contentType: "application/json",
    });
    if (!sig) return {};
    return { sig: sig.sig, ctime: sig.ctime };
  }

  /** Handshake payload, signed fresh. Auth is the httpOnly access-token cookie
   * (sent via the `withCredentials` socket option), so no `token` is sent. */
  function buildAuth() {
    return signHeader();
  }

  const socket = io(getApiOrigin(), {
    // Callback form: every (re)connect is signed anew (fresh `ctime`).
    auth: (cb) => cb(buildAuth()),
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    forceBase64: true,
  });
  if (!ioStore.value.socket) storeSocketIO.setSocketIO({ socket });

  // Only the server's `authenticated` event marks the connection authenticated;
  // opening the transport says nothing about the handshake result.
  function connectSocket() {
    if (socket.connected) return;
    socket.connect();
  }

  // Manual retry after a rejected handshake: one pending timer at a time, the
  // delay doubling from RECONNECT_BASE_MS up to RECONNECT_MAX_MS. Network errors
  // are left to socket.io's own reconnection (`socket.active`).
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  // Consecutive session refreshes tried since the socket was last authenticated.
  let refreshAttempts = 0;
  // Bumped by `destroySocket`: a refresh started earlier must not reconnect.
  let generation = 0;

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function destroySocket() {
    generation++;
    attempt = 0;
    refreshAttempts = 0;
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
    refreshAttempts = 0;
    storeSocketIO.setSocketIO({ authenticated: true, socket });
  };
  const handleDisconnect = (reason: string) => {
    storeSocketIO.setSocketIO({ authenticated: false });
    // socket.io never reconnects after the server closes the socket itself (e.g. a
    // graceful restart), so that case joins the same backoff as a rejected handshake.
    if (reason === SERVER_DISCONNECT) scheduleRetry();
  };
  // The server rejected the handshake: refresh the session once, then reconnect
  // with the rotated cookie. Refused → the session is over (the refresh manager
  // ended it), stop. Transient → keep the backoff. A bounded number of
  // consecutive refreshes per outage, then plain backoff (fresh signature each try).
  async function refreshThenReconnect() {
    refreshAttempts++;
    const started = generation;
    try {
      await refreshSession();
    } catch (error) {
      if (started !== generation) return;
      if (error instanceof SessionEndedError || isRefreshRefused(error)) {
        clearRetry();
        socket.disconnect();
        return;
      }
      scheduleRetry();
      return;
    }
    if (started === generation) socket.connect();
  }
  const handleConnectError = (error: Error) => {
    storeSocketIO.setSocketIO({ authenticated: false });
    // `active` means socket.io is already reconnecting (network error, server
    // down). Otherwise the server rejected the handshake.
    if (socket.active) return;
    // A rejected signature (clock skew, wrong secret) says nothing about the
    // session: no refresh, and the refresh budget stays untouched.
    if ((error as { data?: { errorType?: unknown } }).data?.errorType === HMAC_ERROR_TYPE) {
      if (import.meta.dev) {
        console.warn(
          "Socket signature rejected (HMAC_ERROR): check the device clock and that NUXT_PUBLIC_HMAC_SECRET matches the backend HMAC_SECRET.",
        );
      }
      scheduleRetry();
      return;
    }
    if (error.message === SOCKET_UNAUTHORIZED && refreshAttempts < MAX_REFRESH_ATTEMPTS) {
      void refreshThenReconnect();
    } else {
      scheduleRetry();
    }
  };

  socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
  socket.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);
  socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);

  onMounted(connectSocket);

  onScopeDispose(() => {
    socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
    socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
    destroySocket();
  });

  return {
    socket,
    connectSocket,
    destroySocket,
  };
}

/** Get the live socket from the store, lazy initializing one if none exists yet. */
export function useIo() {
  const storeSocketIO = useSocketIOStore();

  const { ioStore } = storeToRefs(storeSocketIO);

  if (!ioStore.value.socket) {
    const { socket } = useSocketIO();
    return { socket };
  }
  return { socket: ioStore.value.socket as Socket };
}

/** Subscribe to a socket event with auto cleanup on component unmount. */
export function useSocketEvent(event: string, callback: (...args: unknown[]) => void) {
  const { socket } = useIo();
  onMounted(() => socket.on(event, callback));
  onBeforeUnmount(() => socket.off(event, callback));
}
