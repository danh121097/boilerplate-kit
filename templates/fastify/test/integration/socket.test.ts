import { buildApp } from "@/app";
import { closeSocket, getIO, initSocket } from "@/socket";
import { SOCKET_EVENT } from "@/socket/events";
import { emitToUser } from "@/utils/socket-emit";
import { signAccessToken } from "@/utils/jwt";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { signSocketHmac } from "../helpers/hmac-sign";
import type { AddressInfo } from "node:net";
import { createServer, type Server as HttpServer } from "node:http";

/**
 * End-to-end: a real client connects through the HMAC + JWT handshake, joins its user
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
      emitToUser("7", SOCKET_EVENT.PING, { msg: "hi" });

      await expect(received).resolves.toEqual({ msg: "hi" });
    } finally {
      client.disconnect();
    }
  });

  it("rejects a connection without a token (HMAC present)", async () => {
    const client = connect({ hmac: true });
    try {
      const err = await new Promise<Error>((resolve) => {
        client.on("connect_error", resolve);
      });
      expect(err.message).toBe("Unauthorized!");
    } finally {
      client.disconnect();
    }
  });

  it("rejects a connection without the HMAC signature", async () => {
    const client = connect({ token: signAccessToken(PAYLOAD), hmac: false });
    try {
      const err = await new Promise<Error>((resolve) => {
        client.on("connect_error", resolve);
      });
      expect(err.message).toBe("Unauthorized!");
    } finally {
      client.disconnect();
    }
  });
});

describe("Socket.IO lifecycle inside the Fastify app", () => {
  it("attaches to Fastify's HTTP server and is closed with the app", async () => {
    await closeSocket(); // release the module-level server used above
    const app = buildApp();
    await app.ready();
    expect(getIO()?.httpServer).toBe(app.server);

    await app.close();
    expect(getIO()).toBeNull();
  });
});
