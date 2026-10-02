import { buildApp } from "@/app";
import { config } from "@/config/environment";
import { closeSocket, getIO, initSocket } from "@/socket";
import { SOCKET_EVENT } from "@/socket/events";
import { emitToUser } from "@/utils/socket-emit";
import { signAccessToken } from "@/utils/jwt";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { signSocketHmac } from "../helpers/hmac-sign";
import type { AddressInfo } from "node:net";
import { createServer, get as httpGet, type Server as HttpServer } from "node:http";

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

  /** Connect with arbitrary auth and report the client's connect_error message and data. */
  async function rejection(auth: Record<string, unknown>): Promise<Error & { data?: unknown }> {
    const client = ioClient(url, { auth, transports: ["websocket"], reconnection: false });
    try {
      return await new Promise((resolve) => client.on("connect_error", resolve));
    } finally {
      client.disconnect();
    }
  }

  const staleCtime = String(Date.now() - 10 * 60 * 1000);

  it.each([
    {
      name: "a missing signature",
      auth: () => ({ token: signAccessToken(PAYLOAD) }),
    },
    {
      name: "a bad signature",
      auth: () => ({
        token: signAccessToken(PAYLOAD),
        ...signSocketHmac(),
        sig: Buffer.alloc(32, 1).toString("base64"),
      }),
    },
    {
      name: "a stale ctime",
      auth: () => ({
        token: signAccessToken(PAYLOAD),
        ...signSocketHmac(staleCtime),
      }),
    },
    {
      name: "a missing ctime",
      auth: () => ({ token: signAccessToken(PAYLOAD), sig: signSocketHmac().sig }),
    },
    {
      name: "a non-numeric ctime",
      auth: () => ({ token: signAccessToken(PAYLOAD), ...signSocketHmac(), ctime: "soon" }),
    },
  ])("answers HMAC_ERROR data for $name", async ({ auth }) => {
    const err = await rejection(auth());
    expect(err.message).toBe("Unauthorized!");
    expect(err.data).toEqual({ errorType: "HMAC_ERROR" });
  });

  it.each([
    { name: "a missing token", auth: () => ({ ...signSocketHmac() }) },
    { name: "a bad token", auth: () => ({ token: "not.a.jwt", ...signSocketHmac() }) },
  ])("answers Unauthorized! with no data for $name", async ({ auth }) => {
    const err = await rejection(auth());
    expect(err.message).toBe("Unauthorized!");
    expect(err.data).toBeUndefined();
  });
});

describe("Socket.IO handshake origin check (ENABLE_CSRF)", () => {
  const ALLOWED = config.corsOrigins[0];
  const original = config.enableCsrf;
  beforeEach(() => {
    config.enableCsrf = true;
  });
  afterEach(() => {
    config.enableCsrf = original;
  });

  /** Status of the engine.io polling handshake sent with these headers. */
  const handshakeStatus = (headers: Record<string, string | undefined>): Promise<number> =>
    new Promise((resolve, reject) => {
      httpGet(
        `${url}/socket.io/?EIO=4&transport=polling`,
        { headers: headers as Record<string, string> },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      ).on("error", reject);
    });

  /** Open a websocket (the upgrade path) with these extra headers and report whether it connected. */
  const websocketConnects = (extraHeaders: Record<string, string>): Promise<boolean> =>
    new Promise((resolve) => {
      const client = ioClient(url, {
        auth: { token: signAccessToken(PAYLOAD), ...signSocketHmac() },
        extraHeaders,
        transports: ["websocket"],
        reconnection: false,
      });
      client.on("connect", () => {
        client.disconnect();
        resolve(true);
      });
      client.on("connect_error", () => {
        client.disconnect();
        resolve(false);
      });
    });

  it.each([
    { name: "no Cookie, Origin or Referer (native client)", headers: {}, status: 200 },
    { name: "an allow-listed Origin", headers: { origin: ALLOWED }, status: 200 },
    {
      name: "an allow-listed Origin with a Cookie",
      headers: { origin: ALLOWED, cookie: "accessToken=abc" },
      status: 200,
    },
    { name: "an allow-listed Referer", headers: { referer: `${ALLOWED}/page` }, status: 200 },
    { name: "a foreign Origin", headers: { origin: "https://evil.com" }, status: 403 },
    {
      name: "a Cookie but no Origin or Referer",
      headers: { cookie: "accessToken=abc" },
      status: 403,
    },
    {
      name: "a foreign Origin with an allowed-looking Cookie",
      headers: { origin: "https://evil.com", cookie: "a=b" },
      status: 403,
    },
    { name: "a foreign Referer", headers: { referer: "https://evil.com/page" }, status: 403 },
    { name: "an unparseable Referer", headers: { referer: "not a url" }, status: 403 },
  ])("handshake with $name answers $status", async ({ headers, status }) => {
    expect(await handshakeStatus(headers)).toBe(status);
  });

  it("applies the same rule to the websocket upgrade", async () => {
    expect(await websocketConnects({})).toBe(true);
    expect(await websocketConnects({ origin: ALLOWED })).toBe(true);
    expect(await websocketConnects({ origin: "https://evil.com" })).toBe(false);
    expect(await websocketConnects({ cookie: "accessToken=abc" })).toBe(false);
  });

  it("allows an Origin equal to the server's own origin, with or without a Cookie", async () => {
    expect(await websocketConnects({ origin: url })).toBe(true);
    expect(await websocketConnects({ origin: url.toUpperCase().replace("HTTP", "http") })).toBe(
      true,
    );
    expect(await websocketConnects({ origin: url, cookie: "accessToken=abc" })).toBe(true);
  });

  it("refuses the same hostname on another port, and a null Origin", async () => {
    const { port } = new URL(url);
    expect(await websocketConnects({ origin: `http://localhost:${Number(port) + 1}` })).toBe(false);
    expect(await websocketConnects({ origin: "null" })).toBe(false);
    expect(await websocketConnects({ origin: "null", cookie: "a=b" })).toBe(false);
  });

  it("accepts any origin while ENABLE_CSRF is off", async () => {
    config.enableCsrf = false;
    expect(await handshakeStatus({ origin: "https://evil.com", cookie: "a=b" })).toBe(200);
    expect(await websocketConnects({ origin: "https://evil.com" })).toBe(true);
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
