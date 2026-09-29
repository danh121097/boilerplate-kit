import { AppConfigService } from "@/config/app-config.service";
import { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { ServerOptions } from "socket.io";

/**
 * Socket.IO server options shared by every deployment (Redis on or off) — the
 * single source of truth for CORS, heartbeat and payload cap.
 */
export function buildSocketServerOptions(corsOrigins: string[]): Partial<ServerOptions> {
  return {
    cors: { origin: corsOrigins, credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6,
  };
}

/**
 * Socket.IO adapter installed in every environment. It applies the shared server
 * options and, when a Redis pub client is given (REDIS_ENABLED=true), wires the
 * @socket.io/redis-adapter for multi-instance fan-out.
 *
 * Ownership rules (mirror express socket/index.ts "Never quit pub here"):
 *   - pubClient  — the shared ioredis instance owned by RedisModule. NEVER quit here.
 *   - subClient  — a duplicate created in createIOServer(); owned by the redis-adapter
 *     layer, which cleans it up when the adapter closes.
 *
 * Options are set here (not in the @WebSocketGateway decorator) so there is exactly
 * one place to change them.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly corsOrigins: string[];

  constructor(
    app: INestApplication,
    private readonly pubClient: Redis | null,
  ) {
    super(app);
    this.corsOrigins = app.get(AppConfigService).corsOrigins;
  }

  createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter["createIOServer"]> {
    const server = super.createIOServer(port, {
      ...options,
      ...buildSocketServerOptions(this.corsOrigins),
    });

    if (this.pubClient) {
      server.adapter(createAdapter(this.pubClient, this.pubClient.duplicate()));
    }
    return server;
  }
}
