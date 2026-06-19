/**
 * E2E — Realtime gateway (Socket.IO) handshake.
 *
 * Scenarios:
 *   - Authenticated + HMAC-signed handshake → connects and receives "authenticated" event.
 *   - Unsigned handshake → server disconnects the socket.
 *   - HMAC signed but no Bearer token → server disconnects the socket.
 *
 * The socket test boots its own app instance and calls app.listen() so the
 * HTTP server is actually bound to a port (required for Socket.IO to work).
 * supertest works without listen() but Socket.IO needs a real TCP port.
 *
 * If SKIP_SOCKET_TESTS=true these tests are skipped (useful in CI without
 * a stable network interface). All critical security paths are also covered
 * by the HTTP e2e specs so skipping sockets doesn't leave gaps.
 */
import { afterAll, afterEach, beforeAll, describe, it, expect } from "vitest";
import { io, Socket } from "socket.io-client";
import supertest from "supertest";

import { INestApplication } from "@nestjs/common";
import { buildHmacHeaders, signSocketHandshake } from "../helpers/sign-request";
import { createTestApp } from "../helpers/create-test-app";

const SKIP = process.env.SKIP_SOCKET_TESTS === "true";

let app: INestApplication;
let port: number;

// ── bootstrap ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (SKIP) return;
  app = await createTestApp();
  // Must call listen() so the underlying HTTP server binds to a TCP port —
  // Socket.IO requires a real port (supertest.getHttpServer() alone isn't enough).
  await app.listen(0); // OS assigns a free port
  // Retrieve assigned port from the bound HTTP server.
  const httpServer = app.getHttpServer() as import("http").Server;
  const addr = httpServer.address();
  port = typeof addr === "object" && addr !== null ? addr.port : 0;
}, 30_000);

afterAll(async () => {
  if (SKIP || !app) return;
  await app.close();
});

// ── helpers ────────────────────────────────────────────────────────────────

/** Register a user via HTTP and return a valid access token. */
async function getAccessToken(): Promise<string> {
  const req = supertest(app.getHttpServer());
  const email = `socket-${Date.now()}@example.com`;
  const password = "Socket1!@#";

  const h1 = buildHmacHeaders("POST", "/auth/register", { email, password, name: "S" });
  await req
    .post("/api/v1/auth/register")
    .set("sig", h1.sig)
    .set("ctime", h1.ctime)
    .set("Content-Type", "application/json")
    .send({ email, password, name: "Socket User" });

  const body = { email, password };
  const h2 = buildHmacHeaders("POST", "/auth/login", body);
  const res = await req
    .post("/api/v1/auth/login")
    .set("sig", h2.sig)
    .set("ctime", h2.ctime)
    .set("Content-Type", "application/json")
    .send(body);

  return res.body.data.tokens.accessToken as string;
}

/**
 * Connect a socket and wait for the first meaningful event.
 * Resolves with { socket, event, data } when any of the watched events fires.
 */
function connectAndWait(
  authPayload: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): Promise<{ socket: Socket; event: string; data?: unknown }> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://localhost:${port}`, {
      transports: ["websocket"],
      auth: authPayload,
      extraHeaders,
      timeout: 4_000,
      reconnection: false,
    });

    const done = (event: string, data?: unknown) => resolve({ socket, event, data });

    socket.on("authenticated", (d: unknown) => done("authenticated", d));
    socket.on("connect_error", (err: Error) => done("connect_error", err.message));
    socket.on("disconnect", (reason: string) => done("disconnect", reason));

    setTimeout(() => reject(new Error("Socket wait timed out")), 5_000);
  });
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("Socket.IO gateway handshake", () => {
  const openSockets: Socket[] = [];

  afterEach(() => {
    for (const s of openSockets) {
      try { if (s.connected) s.disconnect(); } catch { /* ignore */ }
    }
    openSockets.length = 0;
  });

  it.skipIf(SKIP)(
    "signed + authenticated handshake receives 'authenticated' event",
    async () => {
      const accessToken = await getAccessToken();
      const { sig, ctime } = signSocketHandshake();

      const { socket, event } = await connectAndWait(
        { sig, ctime, token: accessToken },
      );
      openSockets.push(socket);

      expect(event).toBe("authenticated");
    },
    10_000,
  );

  it.skipIf(SKIP)(
    "unsigned handshake is disconnected by the gateway",
    async () => {
      const accessToken = await getAccessToken();
      // No sig/ctime — HMAC check in handleConnection rejects immediately.
      const { socket, event } = await connectAndWait({ token: accessToken });
      openSockets.push(socket);

      expect(["disconnect", "connect_error"]).toContain(event);
    },
    10_000,
  );

  it.skipIf(SKIP)(
    "HMAC signed but no auth token is disconnected (JWT check fails)",
    async () => {
      const { sig, ctime } = signSocketHandshake();
      // Valid HMAC but no token — JWT step rejects.
      const { socket, event } = await connectAndWait({ sig, ctime });
      openSockets.push(socket);

      expect(["disconnect", "connect_error"]).toContain(event);
    },
    10_000,
  );
});
