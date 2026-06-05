/**
 * Central registry of socket.io event names. Reference these instead of string
 * literals so event names stay consistent across server emits and client
 * listeners. Add new events here as the app grows.
 */
export const SOCKET_EVENT = {
  /** Server → client, emitted once the handshake auth succeeds. */
  AUTHENTICATED: "authenticated",
  /** Server → client, a user-targeted notification. */
  NOTIFICATION: "notification",
  /** Server → client, emitted when the server rejects an authenticated session. */
  UNAUTHORIZED: "unauthorized",
  /** Built-in socket.io event fired when a connection attempt fails. */
  CONNECT_ERROR: "connect_error",
} as const;

/** Error message the server sends in `connect_error` when a handshake is rejected. */
export const SOCKET_UNAUTHORIZED_MESSAGE = "Unauthorized!";

export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];
