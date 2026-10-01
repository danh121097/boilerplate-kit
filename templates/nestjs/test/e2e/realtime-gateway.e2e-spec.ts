/**
 * E2E — Realtime gateway (Socket.IO) handshake.
 *
 * Scenarios:
 *   - Authenticated + HMAC-signed handshake → connects and receives "authenticated" event.
 *   - Unsigned handshake → refused at the handshake (connect_error, never connected).
 *   - HMAC signed but no Bearer token → refused at the handshake.
 *   - Polling handshake from an allowed Origin carries CORS headers (Redis off).
 *   - Logout and a reuse-detected revoke-all disconnect the user's sockets.
 *
 * The socket test boots its own app instance; createTestApp binds its HTTP
 * server to a loopback port, which Socket.IO needs (supertest alone would not).
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
import { createTestApp, TEST_HOST } from "../helpers/create-test-app";
import { backdateRotation } from "../helpers/refresh-token-db";
import { REFRESH_REUSE_GRACE_MS } from "@/modules/auth/refresh-session.service";

const SKIP = process.env.SKIP_SOCKET_TESTS === "true";

let app: INestApplication;
let port: number;

// ── bootstrap ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (SKIP) return;
  app = await createTestApp();
  // createTestApp binds the HTTP server to a loopback port, which Socket.IO needs.
  const httpServer = app.getHttpServer() as import("http").Server;
  const addr = httpServer.address();
  port = typeof addr === "object" && addr !== null ? addr.port : 0;
}, 30_000);

afterAll(async () => {
  if (SKIP || !app) return;
  await app.close();
});

// ── helpers ────────────────────────────────────────────────────────────────

/** Register a user via HTTP and return a valid access + refresh token. */
async function getTokens(): Promise<{ accessToken: string; refreshToken: string }> {
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

  return res.body.data.tokens as { accessToken: string; refreshToken: string };
}

async function getAccessToken(): Promise<string> {
  return (await getTokens()).accessToken;
}

function signedPost(path: string, body: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  return supertest(app.getHttpServer())
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body as object);
}

/** Resolve once the socket has been authenticated, then when it disconnects. */
async function connectAuthenticated(accessToken: string): Promise<Socket> {
  const { sig, ctime } = signSocketHandshake();
  const { socket, event } = await connectAndWait({ sig, ctime, token: accessToken });
  expect(event).toBe("authenticated");
  return socket;
}

function waitForDisconnect(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket was not disconnected")), 4_000);
    socket.on("disconnect", (reason: string) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
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
    const socket = io(`http://${TEST_HOST}:${port}`, {
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
      try {
        if (s.connected) s.disconnect();
      } catch {
        /* ignore */
      }
    }
    openSockets.length = 0;
  });

  it.skipIf(SKIP)(
    "signed + authenticated handshake receives 'authenticated' event",
    async () => {
      const accessToken = await getAccessToken();
      const { sig, ctime } = signSocketHandshake();

      const { socket, event } = await connectAndWait({ sig, ctime, token: accessToken });
      openSockets.push(socket);

      expect(event).toBe("authenticated");
    },
    10_000,
  );

  it.skipIf(SKIP)(
    "unsigned handshake is refused before a connection exists",
    async () => {
      const accessToken = await getAccessToken();
      // No sig/ctime — the handshake HMAC middleware rejects it.
      const { socket, event, data } = await connectAndWait({ token: accessToken });
      openSockets.push(socket);

      expect(event).toBe("connect_error");
      expect(data).toBe("Unauthorized!");
      expect(socket.connected).toBe(false);
    },
    10_000,
  );

  it.skipIf(SKIP)(
    "HMAC signed but no auth token is refused (JWT gate fails)",
    async () => {
      const { sig, ctime } = signSocketHandshake();
      // Valid HMAC but no token — the handshake JWT middleware rejects it.
      const { socket, event, data } = await connectAndWait({ sig, ctime });
      openSockets.push(socket);

      expect(event).toBe("connect_error");
      expect(data).toBe("Unauthorized!");
      expect(socket.connected).toBe(false);
    },
    10_000,
  );

  it.skipIf(SKIP)(
    "polling handshake from an allowed origin returns CORS headers",
    async () => {
      const res = await fetch(`http://${TEST_HOST}:${port}/socket.io/?EIO=4&transport=polling`, {
        headers: { Origin: "http://localhost:5173" },
      });
      expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
      expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    },
    10_000,
  );

  it.skipIf(SKIP)(
    "logout disconnects the user's sockets",
    async () => {
      const { accessToken, refreshToken } = await getTokens();
      const socket = await connectAuthenticated(accessToken);
      openSockets.push(socket);

      const disconnected = waitForDisconnect(socket);
      expect((await signedPost("/auth/logout", { refreshToken })).status).toBe(200);
      await expect(disconnected).resolves.toBe("io server disconnect");
    },
    10_000,
  );

  it.skipIf(SKIP)(
    "a reuse-detected revoke-all disconnects the user's sockets",
    async () => {
      const { accessToken, refreshToken } = await getTokens();
      const socket = await connectAuthenticated(accessToken);
      openSockets.push(socket);

      expect((await signedPost("/auth/refresh", { refreshToken })).status).toBe(200);
      await backdateRotation(app, refreshToken, REFRESH_REUSE_GRACE_MS + 1_000);

      const disconnected = waitForDisconnect(socket);
      expect((await signedPost("/auth/refresh", { refreshToken })).status).toBe(401);
      await expect(disconnected).resolves.toBe("io server disconnect");
    },
    10_000,
  );
});
