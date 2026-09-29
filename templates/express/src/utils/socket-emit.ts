import { getIO } from "@/socket";
import { logger } from "@/utils/logger";
import type { SocketEvent } from "@/socket/events";

/**
 * Service-facing emit helpers. They let any module push to clients without
 * importing the Socket.IO server, and no-op when the socket layer isn't
 * initialized (tests, CLI scripts). With the Redis adapter enabled, these reach
 * the target user even on other instances.
 *
 * `event` is typed to `SocketEvent` (the SOCKET_EVENT registry in socket/events.ts)
 * so only declared event names compile — add new events there to use them here.
 */

/**
 * Run a socket operation without ever letting it throw or reject unhandled. With the
 * Redis adapter an emit/disconnect publishes over Redis; during an outage that
 * publish fails, and an unhandled rejection would take the whole process down.
 */
function safely(operation: string, run: () => unknown): void {
  try {
    const result = run();
    if (result instanceof Promise) {
      result.catch((err: unknown) => logger.warn(`${operation} failed`, { err }));
    }
  } catch (err) {
    logger.warn(`${operation} failed`, { err });
  }
}

/** Emit an event to a single user's room (all their connected sockets). */
export function emitToUser(userId: string, event: SocketEvent, payload?: unknown): void {
  safely("emitToUser", () => getIO()?.to(`user:${userId}`).emit(event, payload));
}

/** Emit an event to every connected client. */
export function emitBroadcast(event: SocketEvent, payload?: unknown): void {
  safely("emitBroadcast", () => getIO()?.emit(event, payload));
}

/**
 * Force-disconnect every socket of a user (logout, session revoked); no-op when the
 * socket server is off. Local sockets are dropped first, unconditionally, so this
 * instance honors the revoke even when the cluster-wide publish (other instances,
 * via Redis) fails.
 */
export function disconnectUserSockets(userId: string): void {
  const io = getIO();
  if (!io) return;
  const room = `user:${userId}`;
  safely("disconnectUserSockets (local)", () => io.local.in(room).disconnectSockets(true));
  safely("disconnectUserSockets", () => io.in(room).disconnectSockets(true));
}
