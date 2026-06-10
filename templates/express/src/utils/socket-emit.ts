import { getIO } from "@/socket";
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

/** Emit an event to a single user's room (all their connected sockets). */
export function emitToUser(userId: string, event: SocketEvent, payload?: unknown): void {
  getIO()?.to(`user:${userId}`).emit(event, payload);
}

/** Emit an event to every connected client. */
export function emitBroadcast(event: SocketEvent, payload?: unknown): void {
  getIO()?.emit(event, payload);
}
