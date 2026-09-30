import { SOCKET_EVENT, SOCKET_UNAUTHORIZED } from "@/modules/realtime/events";
import { Injectable } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

/**
 * WebSocket gateway — joins authenticated sockets to their user room.
 *
 * CORS + socket options are intentionally NOT set in the decorator: SocketIoAdapter
 * (installed by configureApp, Redis on or off) constructs the Socket.IO Server in
 * createIOServer() with the full options, so they live in exactly one place.
 *
 * Handshake security (HMAC, then JWT + revocation) runs as Socket.IO middleware
 * registered by SocketIoAdapter, so unauthenticated clients never reach this class
 * (they get `connect_error` "Unauthorized!"). handleConnection still refuses a
 * socket that arrives without an identity, in case the gateway is ever mounted
 * under an adapter that does not install the middleware.
 */
@WebSocketGateway()
@Injectable()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  /** Join the personal room and signal the client that the handshake was accepted. */
  handleConnection(client: Socket): void {
    const userId = (client.data.user as { userId?: string } | undefined)?.userId;
    if (!userId) {
      client.emit("error", SOCKET_UNAUTHORIZED);
      client.disconnect(true);
      return;
    }
    void client.join(`user:${userId}`);
    client.emit(SOCKET_EVENT.AUTHENTICATED);
  }

  /**
   * Disconnect lifecycle — rooms are left automatically by socket.io.
   * No manual cleanup needed; here for interface completeness.
   */
  handleDisconnect(_client: Socket): void {
    // socket.io automatically leaves all rooms on disconnect.
  }
}
