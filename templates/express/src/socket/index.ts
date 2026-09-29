import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";
import { socketAuth } from "@/socket/auth-middleware";
import { SOCKET_EVENT } from "@/socket/events";
import { socketHmac } from "@/socket/hmac-middleware";
import { logger } from "@/utils/logger";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import type { Redis } from "ioredis";

/**
 * Socket.IO server attached to the HTTP server. Optional like the rest of the
 * realtime stack: when Redis is enabled a pub/sub adapter is wired so emits reach
 * clients on every instance; otherwise it runs single-instance. Handshakes are
 * gated by HMAC then JWT (same model as the HTTP API).
 */
let io: Server | null = null;
let subClient: Redis | null = null;

/**
 * The adapter fires `publish` without awaiting or catching it, so a rejection during
 * a Redis outage would be an unhandled rejection. Hand it a view of the client whose
 * publish failures are logged instead.
 */
function withSafePublish(client: Redis): Redis {
  return new Proxy(client, {
    get(target, prop): unknown {
      if (prop === "publish") {
        return (...args: Parameters<Redis["publish"]>): Promise<number> =>
          Promise.resolve(target.publish(...args)).catch((err: unknown) => {
            logger.warn("Socket.IO Redis publish failed", { err });
            return 0;
          });
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const SUBSCRIPTION_METHODS = new Set<PropertyKey>([
  "subscribe",
  "psubscribe",
  "unsubscribe",
  "punsubscribe",
]);

/**
 * The adapter also calls (p)subscribe and (p)unsubscribe without awaiting or catching
 * them. Commands queued while the subscriber is still connecting reject with
 * "Connection is closed" when it is disconnected (shutdown with Redis down) and would
 * be unhandled rejections. Hand it a view whose subscription failures are logged; the
 * raw client stays here for quit()/disconnect().
 */
function withSafeSubscriptions(client: Redis): Redis {
  return new Proxy(client, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      const fn = value.bind(target);
      if (!SUBSCRIPTION_METHODS.has(prop)) return fn;
      return (...args: unknown[]): Promise<unknown> =>
        Promise.resolve(fn(...args)).catch((err: unknown) => {
          logger.warn("Socket.IO Redis subscription command failed", {
            command: String(prop),
            err,
          });
          return 0;
        });
    },
  });
}

/** Create the Socket.IO server, wire auth + (optional) Redis adapter, return it. */
export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    // Heartbeat: drop dead connections without flooding the wire (Socket.IO defaults).
    pingInterval: 25000,
    pingTimeout: 20000,
    // Cap inbound payloads at 1MB to avoid memory abuse from oversized messages.
    maxHttpBufferSize: 1e6,
  });

  // Cross-instance delivery when Redis is on (pub + a duplicated sub connection).
  const pub = getRedis();
  if (pub) {
    // sub is owned here (quit in closeSocket); pub is the shared app client,
    // quit by disconnectRedis. Never quit pub here — would double-close it.
    // The adapter subscribes without awaiting, before the socket is connected: the
    // subscriber must queue those commands and wait for the connection (no retry cap,
    // no timeout) rather than reject unhandled. The shared client's fail-fast options
    // are for request-path commands only.
    subClient = pub.duplicate({
      enableOfflineQueue: true,
      commandTimeout: undefined,
      maxRetriesPerRequest: null,
    });
    subClient.on("error", (err) => logger.warn("Socket.IO Redis subscriber error", { err }));
    io.adapter(createAdapter(withSafePublish(pub), withSafeSubscriptions(subClient)));
  }

  // Reject unauthenticated handshakes before any connection is established.
  // HMAC gate (integrity/replay) first, then JWT (identity) — mirrors HTTP.
  io.use(socketHmac);
  io.use(socketAuth);

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.user?.userId;
    if (userId) socket.join(`user:${userId}`);

    // Tell the client the authenticated handshake is ready.
    socket.emit(SOCKET_EVENT.AUTHENTICATED);
  });

  return io;
}

/** Shared Socket.IO server, or null when not initialized. */
export function getIO(): Server | null {
  return io;
}

/** Graceful close; safe to call even if never initialized. */
export async function closeSocket(): Promise<void> {
  if (io) {
    // Force-drop clients first: io.close() does NOT disconnect live websockets,
    // so without this it can hang past the shutdown grace window.
    io.disconnectSockets(true);
    await io.close();
    io = null;
  }
  if (subClient) {
    // quit() needs a live connection; drop a dead subscriber instead of hanging.
    if (subClient.status === "ready") await subClient.quit();
    else subClient.disconnect();
    subClient = null;
  }
}
