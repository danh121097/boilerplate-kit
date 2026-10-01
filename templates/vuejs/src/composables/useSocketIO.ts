import {
  attachSocketLifecycle,
  connectSocket as connect,
  createSocket,
} from "@/services/core/socket-connection";
import { useSocketIOStore } from "@/stores/socket-io";
import type { Socket } from "socket.io-client";

/**
 * Initialize a socket.io connection scoped to the current component tree.
 *
 * - Connects on mount (only while an access token exists), disconnects on scope dispose.
 * - Handshake auth is built per (re)connect: `{ token: 'Bearer <access_token>',
 *   ...HMACHeaders }`, `token` omitted when signed out. Add extra claims in
 *   `buildAuth` (`services/core/socket-connection.ts`).
 * - `authenticated` turns true only when the server emits `authenticated`, and
 *   false on `connect_error`, `disconnect` and destroy.
 * - A rejected handshake refreshes the session and reconnects, or backs off — see
 *   `attachSocketLifecycle` for the full retry rules.
 */
export function useSocketIO() {
  const storeSocketIO = useSocketIOStore();

  const { ioStore } = storeToRefs(storeSocketIO);

  const socket = createSocket();
  if (!ioStore.value.socket) storeSocketIO.setSocketIO({ socket });

  const lifecycle = attachSocketLifecycle(socket, (authenticated) =>
    storeSocketIO.setSocketIO(authenticated ? { authenticated: true, socket } : { authenticated }),
  );

  // `authenticated` flips to true only when the server emits AUTHENTICATED, so
  // connecting never sets it.
  function connectSocket() {
    connect(socket);
  }

  function destroySocket() {
    lifecycle.stop();
    socket.disconnect();
    if (ioStore.value.socket === socket) {
      storeSocketIO.setSocketIO({ authenticated: false, socket: null });
    }
  }

  onMounted(connectSocket);

  onScopeDispose(() => {
    lifecycle.detach();
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
