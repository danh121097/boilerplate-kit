import { AppLogger } from "@/common/logger/app-logger.service";
import { SocketEvent } from "@/modules/realtime/events";
import { EventsGateway } from "@/modules/realtime/events.gateway";
import { Injectable } from "@nestjs/common";

/**
 * Injectable emit helpers — lets any module push events to clients without
 * coupling directly to the Socket.IO Server. No-ops when the gateway server is
 * not yet initialized (tests, CLI scripts, pre-listen startup).
 *
 * With the Redis adapter active, emitToUser reaches the target user even when
 * they are connected to a different instance — the adapter fan-outs via pub/sub.
 *
 * Mirrors express utils/socket-emit.ts, adapted for NestJS DI.
 */
@Injectable()
export class SocketEmitService {
  constructor(
    private readonly gateway: EventsGateway,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Run a socket operation without ever throwing or leaving a rejection unhandled:
   * with the Redis adapter, emits and disconnects publish over Redis and can fail
   * during an outage. Failures are logged at warn.
   */
  private safely(what: string, op: () => unknown): void {
    const warn = (err: unknown): void =>
      this.logger.warn(`${what} failed: ${err instanceof Error ? err.message : String(err)}`);
    try {
      Promise.resolve(op()).catch(warn);
    } catch (err) {
      warn(err);
    }
  }

  /**
   * Emit an event to a single user's room (all their connected sockets).
   * No-op when the gateway server is not initialized.
   */
  emitToUser(userId: string, event: SocketEvent, payload?: unknown): void {
    this.safely("emitToUser", () => this.gateway.server?.to(`user:${userId}`).emit(event, payload));
  }

  /**
   * Emit an event to every connected client (broadcast).
   * No-op when the gateway server is not initialized.
   */
  emitBroadcast(event: SocketEvent, payload?: unknown): void {
    this.safely("emitBroadcast", () => this.gateway.server?.emit(event, payload));
  }

  /**
   * Force-disconnect every socket of a user, e.g. after logout or a revoked session
   * family. Local sockets go first so this instance honors the revoke even when the
   * Redis adapter is down; the cluster-wide call then reaches other instances.
   * No-op when the server is not initialized.
   */
  disconnectUser(userId: string): void {
    const room = `user:${userId}`;
    this.safely("disconnectUser(local)", () =>
      this.gateway.server?.local.in(room).disconnectSockets(true),
    );
    this.safely("disconnectUser", () => this.gateway.server?.in(room).disconnectSockets(true));
  }
}
