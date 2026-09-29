import { AppLogger } from "@/common/logger/app-logger.service";
import { AppConfigService } from "@/config/app-config.service";
import { createSafePubClient } from "@/redis/safe-pub-client";
import { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Server, ServerOptions } from "socket.io";

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
 *   - subClient  — a duplicate created in createIOServer(); owned by this adapter,
 *     which quits it in close(). It keeps the offline queue and has no retry cap or
 *     command timeout: the redis-adapter issues un-awaited (p)subscribe calls, and a
 *     rejected one would be an unhandled rejection. It carries an error listener.
 *   - The adapter publishes through a proxy that swallows publish rejections (logged
 *     at warn) for the same reason — see createSafePubClient.
 *
 * Options are set here (not in the @WebSocketGateway decorator) so there is exactly
 * one place to change them.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly corsOrigins: string[];
  private readonly logger: AppLogger;
  private subClient: Redis | null = null;

  constructor(
    app: INestApplication,
    private readonly pubClient: Redis | null,
  ) {
    super(app);
    this.corsOrigins = app.get(AppConfigService).corsOrigins;
    this.logger = app.get(AppLogger);
  }

  createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter["createIOServer"]> {
    const server = super.createIOServer(port, {
      ...options,
      ...buildSocketServerOptions(this.corsOrigins),
    });

    if (this.pubClient) {
      const warn = (message: string): void => this.logger.warn(message);
      this.subClient = this.pubClient.duplicate({
        enableOfflineQueue: true,
        commandTimeout: undefined,
        maxRetriesPerRequest: null,
      });
      this.subClient.on("error", (err: Error) => warn(`Redis subscriber error: ${err.message}`));
      server.adapter(createAdapter(createSafePubClient(this.pubClient, warn), this.subClient));
    }
    return server;
  }

  /** Close the socket server, then release the subscriber this adapter created. */
  override async close(server: Server): Promise<void> {
    await super.close(server);
    const sub = this.subClient;
    this.subClient = null;
    if (!sub) return;
    if (sub.status === "ready") await sub.quit().catch(() => sub.disconnect());
    else sub.disconnect();
  }
}
