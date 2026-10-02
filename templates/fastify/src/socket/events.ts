import type { ErrorType } from "@/types";

/**
 * Central registry of socket event names. Reference these instead of string
 * literals so event names stay consistent across server emits and client
 * listeners. Add new events here as the app grows.
 */
export const SOCKET_EVENT = {
  /** Server → client, emitted once the handshake auth succeeds. */
  AUTHENTICATED: "authenticated",
  PING: "ping",
} as const;

/** Error message sent to the client when a handshake is rejected. */
export const SOCKET_UNAUTHORIZED = "Unauthorized!";

export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];

/** `error.data.errorType` on a handshake rejected for its HMAC signature (same value as the HTTP path). */
export const SOCKET_HMAC_ERROR_TYPE: ErrorType = "HMAC_ERROR";
