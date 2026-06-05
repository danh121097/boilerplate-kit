import { getIO } from '@/socket';

/**
 * Service-facing emit helpers. They let any module push to clients without
 * importing the Socket.IO server, and no-op when the socket layer isn't
 * initialized (tests, CLI scripts). With the Redis adapter enabled, these reach
 * the target user even on other instances.
 */

/** Emit an event to a single user's room (all their connected sockets). */
export function emitToUser(
  userId: string,
  event: string,
  payload?: unknown
): void {
  getIO()?.to(`user:${userId}`).emit(event, payload);
}

/** Emit an event to every connected client. */
export function emitBroadcast(event: string, payload?: unknown): void {
  getIO()?.emit(event, payload);
}
