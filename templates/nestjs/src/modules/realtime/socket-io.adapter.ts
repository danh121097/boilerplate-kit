import { isOriginAllowed, isSameOrigin } from "@/common/guards/origin-check";
import { AppLogger } from "@/common/logger/app-logger.service";
import { HmacService } from "@/common/services/hmac.service";
import { TokenRevocationService } from "@/common/services/token-revocation.service";
import { TokenService } from "@/common/services/token.service";
import { AppConfigService } from "@/config/app-config.service";
import {
  createSocketAuthMiddleware,
  createSocketHmacMiddleware,
} from "@/modules/realtime/handshake-middleware";
import { createSafePubClient, createSafeSubClient } from "@/redis/safe-pub-client";
import { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Server, ServerOptions } from "socket.io";

/**
 * Socket.IO server options shared by every deployment (Redis on or off) — the
 * single source of truth for CORS, origin check, heartbeat and payload cap.
 */
export function buildSocketServerOptions(
  config: Pick<AppConfigService, "enableCsrf" | "corsOrigins">,
): Partial<ServerOptions> {
  return {
    cors: { origin: config.corsOrigins, credentials: true },
    // CORS headers do not stop a websocket upgrade, so apply the HTTP origin guard's
    // predicate to every handshake (polling and upgrade) when CSRF protection is on.
    // An Origin equal to the API's own host also passes: native clients (React Native)
    // send the server's own origin, and may attach cookies from their jar.
    allowRequest: (req, callback): void => {
      const allowed =
        !config.enableCsrf ||
        isOriginAllowed(req.headers, config.corsOrigins) ||
        isSameOrigin(req.headers);
      callback(allowed ? null : "Forbidden", allowed);
    },
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
 *
 * Handshakes are gated here too, as Socket.IO middleware (HMAC, then JWT), so an
 * unauthenticated client is refused before a connection exists — same as express
 * socket/index.ts. The gateway only ever sees authenticated sockets.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly config: AppConfigService;
  private readonly logger: AppLogger;
  private readonly hmacService: HmacService;
  private readonly tokenService: TokenService;
  private readonly revocationService: TokenRevocationService;
  private subClient: Redis | null = null;

  constructor(
    app: INestApplication,
    private readonly pubClient: Redis | null,
  ) {
    super(app);
    this.config = app.get(AppConfigService);
    this.logger = app.get(AppLogger);
    this.hmacService = app.get(HmacService);
    this.tokenService = app.get(TokenService);
    this.revocationService = app.get(TokenRevocationService);
  }

  createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter["createIOServer"]> {
    const server = super.createIOServer(port, {
      ...options,
      ...buildSocketServerOptions(this.config),
    });

    if (this.pubClient) {
      const warn = (message: string): void => this.logger.warn(message);
      this.subClient = this.pubClient.duplicate({
        enableOfflineQueue: true,
        commandTimeout: undefined,
        maxRetriesPerRequest: null,
      });
      this.subClient.on("error", (err: Error) => warn(`Redis subscriber error: ${err.message}`));
      server.adapter(
        createAdapter(
          createSafePubClient(this.pubClient, warn),
          createSafeSubClient(this.subClient, warn),
        ),
      );
    }

    // Reject unauthenticated handshakes before any connection is established.
    server.use(createSocketHmacMiddleware(this.hmacService));
    server.use(createSocketAuthMiddleware(this.tokenService, this.revocationService));
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
