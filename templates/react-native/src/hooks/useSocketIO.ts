import {
  attachSocketLifecycle,
  connectSocket as connect,
  createSocket,
  type SocketLifecycle,
} from "@/services/core/socket-connection";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Initialize a socket.io connection scoped to the mounting component.
 *
 * - Connects on mount (only while an access token exists), disconnects on unmount.
 *   The token is read asynchronously from SecureStore, so connecting is async.
 * - Handshake auth is built per (re)connect: `{ token: 'Bearer <ACCESS_TOKEN>',
 *   ...HMACHeaders }`, `token` omitted when signed out.
 * - `authenticated` turns true only when the server emits `authenticated`, and
 *   false on `connect_error`, `disconnect` and destroy.
 * - A rejected handshake refreshes the session and reconnects, or backs off — see
 *   `attachSocketLifecycle` for the full retry rules.
 * - Exposes `socket`, `authenticated`, `connectSocket`, `destroySocket`.
 */
export function useSocketIO() {
  const lifecycleRef = useRef<SocketLifecycle | null>(null);

  // Bumped by every connect and destroy: a connect whose token read finishes after a
  // newer connect or a destroy (unmount, StrictMode remount) is stale and must not open the socket.
  const connectEpochRef = useRef(0);

  const { authenticated, setSocketIO } = useSocketIOStore();

  // One socket instance per hook mount (the lazy initializer runs once).
  const [socket] = useState(createSocket);

  const connectSocket = useCallback(async () => {
    const epoch = ++connectEpochRef.current;
    await connect(socket, () => epoch !== connectEpochRef.current);
    // `authenticated` stays false until the server confirms it.
    if (epoch === connectEpochRef.current) setSocketIO({ socket });
  }, [socket, setSocketIO]);

  const destroySocket = useCallback(() => {
    connectEpochRef.current++;
    lifecycleRef.current?.stop();
    socket.disconnect();
    if (useSocketIOStore.getState().socket === socket) {
      setSocketIO({ authenticated: false, socket: null });
    }
  }, [socket, setSocketIO]);

  useEffect(() => {
    const lifecycle = attachSocketLifecycle(socket, (isAuthenticated) =>
      setSocketIO(isAuthenticated ? { authenticated: true, socket } : { authenticated: false }),
    );
    lifecycleRef.current = lifecycle;

    // Register in the store only when the slot is empty (first mount).
    if (!useSocketIOStore.getState().socket) setSocketIO({ socket });

    void connectSocket();

    return () => {
      lifecycle.detach();
      lifecycleRef.current = null;
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
