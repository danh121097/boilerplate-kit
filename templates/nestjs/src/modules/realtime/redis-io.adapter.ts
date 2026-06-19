import { AppConfigService } from "@/config/app-config.service";
import { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { ServerOptions } from "socket.io";

/**
 * Custom Socket.IO adapter that wires the @socket.io/redis-adapter for
 * multi-instance fan-out. Used when REDIS_ENABLED=true.
 *
 * Ownership rules (mirror express socket/index.ts "Never quit pub here"):
 *   - pubClient  — the shared ioredis instance owned by RedisModule. NEVER quit here.
 *   - subClient  — a duplicate created in createIOServer(); THIS adapter owns it and
 *     must quit it on shutdown. Socket.IO calls close() on the adapter, which triggers
 *     RedisAdapter cleanup of the sub connection automatically via the adapter library.
 *
 * CORS + socket options are set here (not in the @WebSocketGateway decorator) so
 * there is exactly one place to change them. The decorator is kept option-free and
 * these options flow through createIOServer() which is the true construction point.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly corsOrigins: string[];
  private readonly pubClient: Redis;

  constructor(app: INestApplication, pubClient: Redis) {
    super(app);
    this.pubClient = pubClient;
    // Read cors origins from the app's config service.
    this.corsOrigins = app.get(AppConfigService).corsOrigins;
  }

  /**
   * Override IoAdapter.createIOServer to:
   *   1. Merge CORS + heartbeat + buffer-size options (single source of truth).
   *   2. Wire the Redis pub/sub adapter when a valid pub client is available.
   *
   * subClient is duplicated from pubClient here and owned by the redis-adapter
   * layer — do NOT quit it manually; the adapter quits it via its own cleanup.
   */
  createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter["createIOServer"]> {
    // Spread incoming options first, then apply our overrides. Cast to `any`
    // to avoid fighting the ServerOptions `path: string` (not `string|undefined`)
    // strictness — the spread from Nest's internal options is safe at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mergedOptions: any = {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true },
      // Match express socket config exactly.
      pingInterval: 25000,
      pingTimeout: 20000,
      maxHttpBufferSize: 1e6,
    };

    const server = super.createIOServer(port, mergedOptions);

    // Duplicate the shared pub client for subscriptions. The sub duplicate is
    // owned by the redis-adapter internals and cleaned up when the adapter closes.
    // Never call pubClient.quit() here — RedisModule owns the pub lifecycle.
    const subClient = this.pubClient.duplicate();
    server.adapter(createAdapter(this.pubClient, subClient));

    return server;
  }
}
