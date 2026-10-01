import {
  attachSocketLifecycle,
  connectSocket as connect,
  createSocket,
  type SocketLifecycle,
} from "@/services/core/socket-connection";
import { useSocketIOStore } from "@/stores/socket-io";

/**
 * Initialize a socket.io connection scoped to the mounting component.
 *
 * - Connects on mount (only while an access token exists), disconnects on unmount.
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

  const { authenticated, setSocketIO } = useSocketIOStore();

  // One socket instance per hook mount (the lazy initializer runs once).
  const [socket] = useState(createSocket);

  const connectSocket = useCallback(() => {
    connect(socket);
    setSocketIO({ socket });
  }, [socket, setSocketIO]);

  const destroySocket = useCallback(() => {
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

    connectSocket();

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
 * Reads the live socket reactively, so it rebinds when the socket changes.
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
