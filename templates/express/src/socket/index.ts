import { socketAuth } from "./auth-middleware";
import { SOCKET_EVENT } from "./events";
import { socketHmac } from "./hmac-middleware";
import { config } from "@/config/environment";
import { getRedis } from "@/config/redis";
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
    subClient = pub.duplicate();
    io.adapter(createAdapter(pub, subClient));
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
    await subClient.quit();
    subClient = null;
  }
}
