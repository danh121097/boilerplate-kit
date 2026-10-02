import { signSocketHmac } from "@/__tests__/helpers/hmac-sign";
import { config } from "@/config/environment";
import { closeSocket, initSocket } from "@/socket";
import { signAccessToken } from "@/utils/jwt";
import { createServer, type Server as HttpServer } from "http";
import { io as ioClient } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "net";

/**
 * Handshake / upgrade origin check: the CSRF origin rule (ENABLE_CSRF) applied to the
 * WebSocket upgrade. Every client carries a valid token + HMAC, so only the origin
 * decides the outcome.
 */

const ALLOWED = config.corsOrigins[0];
const FOREIGN = "https://evil.example.com";
const PAYLOAD = { userId: "7", email: "a@b.com", role: "user" as const };

let httpServer: HttpServer;
let url: string;
let SELF: string;
let SELF_OTHER_PORT: string;
const originalCsrf = config.enableCsrf;

beforeAll(async () => {
  httpServer = createServer();
  initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  url = `http://localhost:${port}`;
  SELF = url;
  SELF_OTHER_PORT = `http://localhost:${port === 65535 ? port - 1 : port + 1}`;
});

afterAll(async () => {
  await closeSocket();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

afterEach(() => {
  config.enableCsrf = originalCsrf;
});

/** Try to connect with the given extra headers; resolve whether the handshake completed. */
async function connects(headers: Record<string, string>): Promise<boolean> {
  const client = ioClient(url, {
    auth: { token: signAccessToken(PAYLOAD), ...signSocketHmac() },
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: headers,
  });
  try {
    return await new Promise<boolean>((resolve) => {
      client.on("connect", () => resolve(true));
      client.on("connect_error", () => resolve(false));
    });
  } finally {
    client.disconnect();
  }
}

describe("Socket.IO origin check with ENABLE_CSRF on", () => {
  it.each([
    ["no Cookie, Origin or Referer (native client)", {}, true],
    ["an allow-listed Origin", { Origin: ALLOWED }, true],
    ["an allow-listed Origin with a Cookie", { Origin: ALLOWED, Cookie: "accessToken=x" }, true],
    ["an allow-listed Referer", { Referer: `${ALLOWED}/page` }, true],
    ["a foreign Origin", { Origin: FOREIGN }, false],
    ["a foreign Origin with a Cookie", { Origin: FOREIGN, Cookie: "accessToken=x" }, false],
    ["a Cookie but no Origin or Referer", { Cookie: "accessToken=x" }, false],
    ["a foreign Referer", { Referer: `${FOREIGN}/page` }, false],
    ["an unparseable Referer", { Referer: "not a url" }, false],
    ["Origin: null", { Origin: "null" }, false],
  ] as const)("%s -> connected: %s", async (_name, headers, expected) => {
    config.enableCsrf = true;
    expect(await connects({ ...headers })).toBe(expected);
  });
});

describe("Socket.IO origin check with the server's own Origin (native WebSocket)", () => {
  beforeEach(() => {
    config.enableCsrf = true;
  });

  it("connects without a Cookie", async () => {
    expect(await connects({ Origin: SELF })).toBe(true);
  });

  it("connects with a Cookie", async () => {
    expect(await connects({ Origin: SELF, Cookie: "accessToken=x" })).toBe(true);
  });

  it("refuses the same hostname on another port", async () => {
    expect(await connects({ Origin: SELF_OTHER_PORT })).toBe(false);
  });
});

describe("Socket.IO origin check with ENABLE_CSRF off", () => {
  it("does not look at the origin (default behaviour)", async () => {
    config.enableCsrf = false;
    expect(await connects({ Origin: FOREIGN, Cookie: "accessToken=x" })).toBe(true);
  });
});
