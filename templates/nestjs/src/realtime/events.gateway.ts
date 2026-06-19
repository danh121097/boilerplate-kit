import { HmacService, DEFAULT_CONTENT_TYPE, SOCKET_HMAC_PATH } from "@/common/hmac.service";
import { TokenRevocationService } from "@/common/token-revocation.service";
import { TokenService } from "@/common/token.service";
import { JwtPayload } from "@/common/types/auth.types";
import { SOCKET_EVENT, SOCKET_UNAUTHORIZED } from "@/realtime/events";
import { Injectable } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

/**
 * WebSocket gateway — authenticates handshakes and manages user rooms.
 *
 * CORS + socket options are intentionally NOT set in the decorator: when
 * RedisIoAdapter is active, it constructs the Socket.IO Server directly in
 * createIOServer() and passes the full options there. When the default IoAdapter
 * is used (Redis disabled), the gateway decorator options would apply, but to
 * keep a single source of truth for all options we rely on the adapter path in
 * main.ts setting a thin default adapter wrapper. The decorator is kept minimal
 * (no cors/transport opts) — all socket server options live in RedisIoAdapter
 * or the DefaultSocketAdapter used in main.ts.
 *
 * Handshake security — HMAC first, then JWT (mirrors express middleware chain):
 *   1. HMAC: sig + ctime from handshake.auth verify the signed socket contract.
 *   2. JWT:  token from handshake.auth.token or accessToken cookie; revocation check.
 * Any failure disconnects the socket immediately with SOCKET_UNAUTHORIZED.
 */
@WebSocketGateway()
@Injectable()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly hmacService: HmacService,
    private readonly tokenService: TokenService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {}

  /**
   * Handshake gate: HMAC integrity/replay check → JWT identity check.
   * Mirrors express socketHmac (runs first) then socketAuth (runs second).
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      // --- Step 1: HMAC gate (integrity + replay prevention) ---
      const sig = client.handshake.auth?.sig as string | undefined;
      const ctime = client.handshake.auth?.ctime as string | number | undefined;

      if (!sig || ctime === undefined) {
        this.rejectClient(client);
        return;
      }

      const hmacError = this.hmacService.verifyHmac({
        method: "GET",
        contentType: DEFAULT_CONTENT_TYPE,
        ctime,
        path: SOCKET_HMAC_PATH,
        sig,
      });

      if (hmacError) {
        this.rejectClient(client);
        return;
      }

      // --- Step 2: JWT gate (identity + revocation) ---
      const token = this.extractToken(client);
      if (!token) {
        this.rejectClient(client);
        return;
      }

      const payload = this.tokenService.verifyAccessToken(token) as JwtPayload & {
        iat?: number;
      };

      const revokedAt = await this.tokenRevocationService.getUserRevokedAt(payload.userId);
      if (revokedAt && payload.iat && payload.iat < revokedAt) {
        this.rejectClient(client);
        return;
      }

      // Handshake accepted — set user context, join personal room, signal client.
      client.data.user = payload;
      void client.join(`user:${payload.userId}`);
      client.emit(SOCKET_EVENT.AUTHENTICATED);
    } catch {
      // verifyAccessToken or any unexpected error → reject.
      this.rejectClient(client);
    }
  }

  /**
   * Disconnect lifecycle — rooms are left automatically by socket.io.
   * No manual cleanup needed; here for interface completeness.
   */
  handleDisconnect(_client: Socket): void {
    // socket.io automatically leaves all rooms on disconnect.
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Emit error event then force-disconnect the socket. */
  private rejectClient(client: Socket): void {
    client.emit("error", SOCKET_UNAUTHORIZED);
    client.disconnect(true);
  }

  /**
   * Extract the raw access token from handshake auth or the accessToken cookie.
   * Strips the "Bearer " prefix if present — mirrors express auth-middleware.
   */
  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) {
      return fromAuth.startsWith("Bearer ") ? fromAuth.slice(7) : fromAuth;
    }
    return this.readCookie(client.handshake.headers.cookie, "accessToken");
  }

  /** Parse a single cookie value from a raw Cookie header string. */
  private readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return decodeURIComponent(rest.join("="));
    }
    return undefined;
  }
}
