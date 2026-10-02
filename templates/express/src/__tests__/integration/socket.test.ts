import { signSocketHmac } from "@/__tests__/helpers/hmac-sign";
import { closeSocket, initSocket } from "@/socket";
import { SOCKET_EVENT } from "@/socket/events";
import { signAccessToken } from "@/utils/jwt";
import { createServer, type Server as HttpServer } from "http";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "net";

/**
 * End-to-end: a real client connects through the JWT handshake, joins its user
 * room, and receives a targeted emit. Redis is off (single-instance) under test.
 */

let httpServer: HttpServer;
let url: string;

const PAYLOAD = { userId: "7", email: "a@b.com", role: "user" as const };

beforeAll(async () => {
  httpServer = createServer();
  initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  url = `http://localhost:${port}`;
});

afterAll(async () => {
  await closeSocket();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

/** Connect with optional JWT token and optional HMAC handshake signature. */
function connect(opts: { token?: string; hmac?: boolean } = {}): ClientSocket {
  const { token, hmac = true } = opts;
  const auth: Record<string, unknown> = {};
  if (token) auth.token = token;
  // Client signs the fixed socket contract: GET + application/json + /socket.
  if (hmac) Object.assign(auth, signSocketHmac());
  return ioClient(url, { auth, transports: ["websocket"], reconnection: false });
}

describe("Socket.IO handshake + targeted emit", () => {
  it("connects with a valid token + HMAC and receives a room-targeted emit", async () => {
    const client = connect({ token: signAccessToken(PAYLOAD) });
    try {
      const connectedAck = new Promise<void>((resolve) =>
        client.on(SOCKET_EVENT.AUTHENTICATED, () => resolve()),
      );
      await new Promise<void>((resolve, reject) => {
        client.on("connect", resolve);
        client.on("connect_error", reject);
      });
      await connectedAck; // server confirms authenticated handshake

      const received = new Promise<{ msg: string }>((resolve) =>
        client.on(SOCKET_EVENT.PING, resolve),
      );
      const { emitToUser } = await import("@/utils/socket-emit");
      emitToUser("7", SOCKET_EVENT.PING, { msg: "hi" });

      await expect(received).resolves.toEqual({ msg: "hi" });
    } finally {
      client.disconnect();
    }
  });

  /** Connect and resolve with the handshake rejection the client sees. */
  async function rejection(opts: {
    token?: string;
    auth?: Record<string, unknown>;
  }): Promise<Error & { data?: unknown }> {
    const client = ioClient(url, {
      auth: { ...(opts.token ? { token: opts.token } : {}), ...opts.auth },
      transports: ["websocket"],
      reconnection: false,
    });
    try {
      return await new Promise((resolve) => client.on("connect_error", resolve));
    } finally {
      client.disconnect();
    }
  }

  const staleCtime = String(Date.now() - 10 * 60 * 1000);
  const hmacCases: Record<string, () => Record<string, unknown>> = {
    "missing signature": () => ({}),
    "invalid signature": () => ({ ...signSocketHmac(), sig: "bm90LWEtc2lnbmF0dXJl" }),
    "stale ctime": () => ({ ...signSocketHmac(), ctime: staleCtime }),
    "missing ctime": () => ({ sig: signSocketHmac().sig }),
    "non-numeric ctime": () => ({ ...signSocketHmac(), ctime: "soon" }),
  };

  it.each(Object.keys(hmacCases))(
    "rejects an HMAC failure (%s) with Unauthorized! and errorType HMAC_ERROR",
    async (kind) => {
      const err = await rejection({ token: signAccessToken(PAYLOAD), auth: hmacCases[kind]() });
      expect(err.message).toBe("Unauthorized!");
      expect(err.data).toEqual({ errorType: "HMAC_ERROR" });
    },
  );

  it("rejects a missing token with Unauthorized! and no error data", async () => {
    const err = await rejection({ auth: signSocketHmac() });
    expect(err.message).toBe("Unauthorized!");
    expect(err.data).toBeUndefined();
  });

  it("rejects a bad token with Unauthorized! and no error data", async () => {
    const err = await rejection({ token: "not.a.jwt", auth: signSocketHmac() });
    expect(err.message).toBe("Unauthorized!");
    expect(err.data).toBeUndefined();
  });
});
