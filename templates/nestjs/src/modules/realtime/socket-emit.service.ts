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
  constructor(private readonly gateway: EventsGateway) {}

  /**
   * Emit an event to a single user's room (all their connected sockets).
   * No-op when the gateway server is not initialized.
   */
  emitToUser(userId: string, event: SocketEvent, payload?: unknown): void {
    this.gateway.server?.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Emit an event to every connected client (broadcast).
   * No-op when the gateway server is not initialized.
   */
  emitBroadcast(event: SocketEvent, payload?: unknown): void {
    this.gateway.server?.emit(event, payload);
  }
}
