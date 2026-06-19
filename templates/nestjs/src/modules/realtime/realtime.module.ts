import { EventsGateway } from "@/modules/realtime/events.gateway";
import { SocketEmitService } from "@/modules/realtime/socket-emit.service";
import { Module } from "@nestjs/common";

/**
 * Realtime module — provides the WebSocket gateway and the injectable emit
 * service consumed by other modules (auth, user, etc.) to push events.
 *
 * CommonModule is @Global so HmacService, TokenService, and
 * TokenRevocationService are available here without an explicit import.
 *
 * SocketEmitService is exported so feature modules can inject it directly:
 *   constructor(private readonly emit: SocketEmitService) {}
 */
@Module({
  providers: [EventsGateway, SocketEmitService],
  exports: [SocketEmitService],
})
export class RealtimeModule {}
