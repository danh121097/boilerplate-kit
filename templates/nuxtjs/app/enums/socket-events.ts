/**
 * Central registry of socket.io event names. Reference these instead of string
 * literals so event names stay consistent across server emits and client
 * listeners. Add new events here as the app grows.
 */
export const SOCKET_EVENT = {
  /** Server → client, emitted once the handshake auth succeeds. */
  AUTHENTICATED: "authenticated",
  /** Server → client heartbeat event. */
  PING: "ping",
  /** Built-in socket.io event fired when an established connection drops. */
  DISCONNECT: "disconnect",
  /** Built-in socket.io event fired when a connection attempt fails. */
  CONNECT_ERROR: "connect_error",
} as const;

export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];
