/**
 * E2E — Socket.IO handshake origin check with ENABLE_CSRF=true.
 *
 * The websocket upgrade is not covered by CORS, so the adapter applies the HTTP
 * origin guard's predicate to the handshake: no Cookie/Origin/Referer passes
 * (native clients), an Origin outside corsOrigins is refused, and a Cookie without
 * an allowed Origin is refused. An Origin equal to the server's own host passes (React
 * Native sends it), with or without a Cookie; another port or `null` does not. Every case carries valid HMAC + JWT so only the
 * origin check decides.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io, Socket } from "socket.io-client";
import supertest from "supertest";

vi.hoisted(() => {
  process.env.ENABLE_CSRF = "true";
});

import { INestApplication } from "@nestjs/common";
import { createTestApp, TEST_HOST } from "../helpers/create-test-app";
import { buildHmacHeaders, signSocketHandshake } from "../helpers/sign-request";

const ALLOWED = "http://localhost:5173";
const SKIP = process.env.SKIP_SOCKET_TESTS === "true";

let app: INestApplication;
let port: number;
let accessToken: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  if (SKIP) return;
  app = await createTestApp();
  const addr = (app.getHttpServer() as import("http").Server).address();
  port = typeof addr === "object" && addr !== null ? addr.port : 0;

  // CSRF is on, so the register POST carries an allowed Origin like a browser would.
  const body = { email: "origin-check@example.com", password: "OriginChk1!", name: "Origin" };
  const h = buildHmacHeaders("POST", "/auth/register", body);
  const res = await supertest(app.getHttpServer())
    .post("/api/v1/auth/register")
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Origin", ALLOWED)
    .set("Content-Type", "application/json")
    .send(body);
  accessToken = res.body.data.tokens.accessToken as string;
}, 30_000);

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  if (app) await app.close();
});

function connect(extraHeaders: Record<string, string>): Promise<"authenticated" | "refused"> {
  return new Promise((resolve, reject) => {
    const { sig, ctime } = signSocketHandshake();
    const socket = io(`http://${TEST_HOST}:${port}`, {
      transports: ["websocket"],
      auth: { sig, ctime, token: accessToken },
      extraHeaders,
      reconnection: false,
      timeout: 4_000,
    });
    sockets.push(socket);
    socket.on("authenticated", () => resolve("authenticated"));
    socket.on("connect_error", () => resolve("refused"));
    setTimeout(() => reject(new Error("Socket wait timed out")), 5_000);
  });
}

describe("Socket.IO handshake origin check (ENABLE_CSRF=true)", () => {
  it.skipIf(SKIP)("lets a native client with no Cookie/Origin/Referer connect", async () => {
    expect(await connect({})).toBe("authenticated");
  });

  it.skipIf(SKIP)("lets an allowed Origin connect", async () => {
    expect(await connect({ Origin: ALLOWED })).toBe("authenticated");
  });

  it.skipIf(SKIP)("lets an allowed Origin with a Cookie connect", async () => {
    expect(await connect({ Origin: ALLOWED, Cookie: "refreshToken=abc" })).toBe("authenticated");
  });

  it.skipIf(SKIP)("refuses an Origin outside corsOrigins", async () => {
    expect(await connect({ Origin: "http://evil.example" })).toBe("refused");
  });

  it.skipIf(SKIP)("refuses a Cookie that comes without an allowed Origin", async () => {
    expect(await connect({ Cookie: "refreshToken=abc" })).toBe("refused");
  });

  it.skipIf(SKIP)("lets the server's own Origin connect, with and without a Cookie", async () => {
    const own = `http://${TEST_HOST}:${port}`;
    expect(await connect({ Origin: own })).toBe("authenticated");
    expect(await connect({ Origin: own, Cookie: "refreshToken=abc" })).toBe("authenticated");
  });

  it.skipIf(SKIP)("refuses the same hostname on another port", async () => {
    expect(await connect({ Origin: `http://${TEST_HOST}:${port + 1}` })).toBe("refused");
  });

  it.skipIf(SKIP)("refuses Origin: null", async () => {
    expect(await connect({ Origin: "null" })).toBe("refused");
    expect(await connect({ Origin: "null", Cookie: "refreshToken=abc" })).toBe("refused");
  });

  it.skipIf(SKIP)("refuses a Referer from a disallowed origin", async () => {
    expect(await connect({ Referer: "http://evil.example/page" })).toBe("refused");
  });
});
