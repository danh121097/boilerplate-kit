import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io";

/**
 * Handshake auth accepts only a valid, non-revoked access token from the auth
 * payload or the accessToken cookie, mirroring the HTTP middleware.
 */

const getRedisMock = vi.fn();
vi.mock("@/config/redis", () => ({ getRedis: () => getRedisMock() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  getRedisMock.mockReturnValue(null); // Redis off by default → no revocation
});
afterEach(() => vi.resetModules());

function fakeSocket(opts: { token?: string; cookie?: string }): Socket {
  return {
    handshake: {
      auth: opts.token ? { token: opts.token } : {},
      headers: opts.cookie ? { cookie: opts.cookie } : {},
    },
    data: {},
  } as unknown as Socket;
}

async function load() {
  const { socketAuth } = await import("@/socket/auth-middleware");
  const { signAccessToken } = await import("@/utils/jwt");
  return { socketAuth, signAccessToken };
}

const PAYLOAD = { userId: "1", email: "a@b.com", role: "user" as const };

describe("socketAuth", () => {
  it("accepts a valid token from handshake.auth and sets socket.data.user", async () => {
    const { socketAuth, signAccessToken } = await load();
    const socket = fakeSocket({ token: signAccessToken(PAYLOAD) });
    const next = vi.fn();

    await socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user.userId).toBe("1");
  });

  it('accepts a "Bearer <token>" prefixed token', async () => {
    const { socketAuth, signAccessToken } = await load();
    const socket = fakeSocket({ token: `Bearer ${signAccessToken(PAYLOAD)}` });
    const next = vi.fn();

    await socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user.userId).toBe("1");
  });

  it("accepts a valid token from the accessToken cookie", async () => {
    const { socketAuth, signAccessToken } = await load();
    const socket = fakeSocket({ cookie: `accessToken=${signAccessToken(PAYLOAD)}` });
    const next = vi.fn();

    await socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user.userId).toBe("1");
  });

  it("rejects when no token is present", async () => {
    const { socketAuth } = await load();
    const next = vi.fn();
    await socketAuth(fakeSocket({}), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rejects an invalid token", async () => {
    const { socketAuth } = await load();
    const next = vi.fn();
    await socketAuth(fakeSocket({ token: "not-a-jwt" }), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rejects a token issued before the revoke cutoff (Redis on)", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    getRedisMock.mockReturnValue({ get: vi.fn(async () => String(future)) });
    const { socketAuth, signAccessToken } = await load();
    const next = vi.fn();

    await socketAuth(fakeSocket({ token: signAccessToken(PAYLOAD) }), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
