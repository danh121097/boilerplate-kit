import { SOCKET_EVENT } from "@/enums";
import { getApiOrigin } from "@/services/core/api-config";
import { isRefreshRefused, SessionEndedError } from "@/services/core/api-errors";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { refreshSession } from "@/services/core/session-refresher";
import { useSocketIOStore } from "@/stores/socket-io";
import { useCallback, useEffect, useRef } from "react";

/** First delay before a rejected handshake is retried; doubles per attempt. */
const RECONNECT_BASE_MS = 2000;
/** Ceiling for the retry delay. */
const RECONNECT_MAX_MS = 30_000;
/** Consecutive session refreshes tried per outage before falling back to plain backoff. */
const MAX_REFRESH_ATTEMPTS = 3;
/** `connect_error` message the server sends when it rejects a handshake. */
const SOCKET_UNAUTHORIZED = "Unauthorized!";
/** Disconnect reason when the server closed the socket; socket.io does not reconnect on its own. */
const SERVER_DISCONNECT = "io server disconnect";

/** Handshake signature, built by the same signer as the HTTP requests. Empty when
 * no HMAC secret is configured. */
function signHeader(): { sig?: string; ctime?: number } {
  const signed = HMACSignatureGenerator.signRequest({
    method: "GET",
    path: "/socket",
    contentType: "application/json",
  });
  return signed ? { sig: signed.sig, ctime: signed.ctime } : {};
}

/** Handshake payload, signed fresh. Auth is the httpOnly cookie, so no `token` is sent. */
function buildAuth() {
  return signHeader();
}

export function useSocketIO() {
  // Pending retry timer + a generation that `stopRecovery` bumps, so a refresh still
  // in flight when the socket is destroyed or unmounted never reconnects it.
  const recovery = useRef<{ generation: number; timer: ReturnType<typeof setTimeout> | null }>({
    generation: 0,
    timer: null,
  });

  const stopRecovery = useCallback(() => {
    recovery.current.generation += 1;
    if (recovery.current.timer) clearTimeout(recovery.current.timer);
    recovery.current.timer = null;
  }, []);

  const connectSocket = useCallback(() => {
    if (typeof window === "undefined") return;

    const currentSocket = useSocketIOStore.getState().socket;
    if (!currentSocket) return;

    // `authenticated` flips only on the server's `authenticated` event.
    if (!currentSocket.connected) currentSocket.connect();
  }, []);

  const { socket, authenticated, setSocketIO } = useSocketIOStore();

  const destroySocket = useCallback(() => {
    stopRecovery();
    const currentSocket = useSocketIOStore.getState().socket;
    if (!currentSocket) return;
    currentSocket.disconnect();
    setSocketIO({ authenticated: false, socket: null });
  }, [setSocketIO, stopRecovery]);

  // Initialize the socket instance once (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    import("socket.io-client").then(({ io }) => {
      const existing = useSocketIOStore.getState().socket;
      if (existing) return;

      const newSocket = io(getApiOrigin(), {
        // Callback form: every (re)connect is signed anew (fresh `ctime`).
        auth: (cb) => cb(buildAuth()),
        transports: ["websocket"],
        withCredentials: true,
        autoConnect: false,
        forceBase64: true,
      });
      setSocketIO({ socket: newSocket });
    });
  }, [setSocketIO]);

  // Attach event handlers and connect once the socket is ready
  useEffect(() => {
    if (!socket) return;

    let attempt = 0;
    // Consecutive session refreshes tried since the socket was last authenticated.
    let refreshAttempts = 0;

    const handleAuthenticated = () => {
      attempt = 0;
      refreshAttempts = 0;
      setSocketIO({ authenticated: true });
    };
    // ONE manual retry at a time on the same socket (`auth` is re-signed per connect)
    // with exponential backoff.
    const scheduleRetry = () => {
      if (recovery.current.timer) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      attempt++;
      recovery.current.timer = setTimeout(() => {
        recovery.current.timer = null;
        connectSocket();
      }, delay);
    };
    const handleDisconnect = (reason: string) => {
      setSocketIO({ authenticated: false });
      // socket.io never reconnects after the server closes the socket itself (e.g. a
      // graceful restart), so that case joins the same backoff as a rejected handshake.
      if (reason === SERVER_DISCONNECT) scheduleRetry();
    };
    // The server rejected the handshake: refresh the session once, then reconnect
    // with the rotated cookie. Refused → the session is over (the refresh manager
    // ended it), stop. Transient (incl. a rejected signature) → keep the backoff.
    const refreshThenReconnect = async () => {
      refreshAttempts += 1;
      const started = recovery.current.generation;
      try {
        await refreshSession();
      } catch (error) {
        if (started !== recovery.current.generation) return;
        if (error instanceof SessionEndedError || isRefreshRefused(error)) {
          stopRecovery();
          socket.disconnect();
          return;
        }
        scheduleRetry();
        return;
      }
      if (started === recovery.current.generation) socket.connect();
    };
    const handleConnectError = (error: Error) => {
      setSocketIO({ authenticated: false });
      // `active` means socket.io is already auto-reconnecting (network error, server
      // down). Otherwise the server rejected the handshake.
      if (socket.active) return;
      // A bounded number of consecutive refreshes per outage, then plain backoff.
      if (error.message === SOCKET_UNAUTHORIZED && refreshAttempts < MAX_REFRESH_ATTEMPTS) {
        void refreshThenReconnect();
      } else {
        scheduleRetry();
      }
    };

    socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
    socket.on(SOCKET_EVENT.DISCONNECT, handleDisconnect);
    socket.on(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);

    connectSocket();

    return () => {
      socket.off(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
      socket.off(SOCKET_EVENT.DISCONNECT, handleDisconnect);
      socket.off(SOCKET_EVENT.CONNECT_ERROR, handleConnectError);
      // `destroySocket` cancels a pending retry and invalidates an in-flight refresh.
      destroySocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  return { socket, authenticated, connectSocket, destroySocket };
}

/**
 * Subscribe to a socket event with auto-cleanup on component unmount.
 * Requires the consuming component to be a client component (`"use client"`).
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
