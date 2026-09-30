import { SOCKET_EVENT } from "@/socket/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Emit helpers route to the right room/broadcast when the socket server is up,
 * and are safe no-ops when it isn't initialized. Event names come from the
 * SOCKET_EVENT registry (the helpers are typed to SocketEvent).
 */

const getIOMock = vi.fn();
vi.mock("@/socket", () => ({ getIO: () => getIOMock() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});
afterEach(() => vi.resetModules());

describe("socket emit helpers — not initialized", () => {
  it("emitToUser / emitBroadcast no-op when getIO is null", async () => {
    getIOMock.mockReturnValue(null);
    const { emitToUser, emitBroadcast } = await import("@/utils/socket-emit");

    expect(() => emitToUser("1", SOCKET_EVENT.PING, { a: 1 })).not.toThrow();
    expect(() => emitBroadcast(SOCKET_EVENT.PING, { a: 1 })).not.toThrow();
  });

  it("disconnectUserSockets no-ops when getIO is null", async () => {
    getIOMock.mockReturnValue(null);
    const { disconnectUserSockets } = await import("@/utils/socket-emit");
    expect(() => disconnectUserSockets("1")).not.toThrow();
  });
});

describe("socket emit helpers — initialized", () => {
  it("emitToUser targets the user room", async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    getIOMock.mockReturnValue({ to, emit: vi.fn() });
    const { emitToUser } = await import("@/utils/socket-emit");

    emitToUser("42", SOCKET_EVENT.PING, { msg: "hi" });

    expect(to).toHaveBeenCalledWith("user:42");
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENT.PING, { msg: "hi" });
  });

  it("emitBroadcast emits to everyone", async () => {
    const emit = vi.fn();
    getIOMock.mockReturnValue({ emit, to: vi.fn() });
    const { emitBroadcast } = await import("@/utils/socket-emit");

    emitBroadcast(SOCKET_EVENT.PING, 1);

    expect(emit).toHaveBeenCalledWith(SOCKET_EVENT.PING, 1);
  });
});

describe("disconnectUserSockets", () => {
  it("drops local sockets first, then every socket in the user room cluster-wide", async () => {
    const localDisconnect = vi.fn();
    const localIn = vi.fn(() => ({ disconnectSockets: localDisconnect }));
    const disconnectSockets = vi.fn();
    const inRoom = vi.fn(() => ({ disconnectSockets }));
    getIOMock.mockReturnValue({ in: inRoom, local: { in: localIn } });
    const { disconnectUserSockets } = await import("@/utils/socket-emit");

    disconnectUserSockets("42");

    expect(localIn).toHaveBeenCalledWith("user:42");
    expect(localDisconnect).toHaveBeenCalledWith(true);
    expect(inRoom).toHaveBeenCalledWith("user:42");
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it("still drops local sockets when the cluster-wide disconnect throws or rejects", async () => {
    const localDisconnect = vi.fn();
    getIOMock.mockReturnValue({
      local: { in: () => ({ disconnectSockets: localDisconnect }) },
      in: () => ({ disconnectSockets: () => Promise.reject(new Error("publish failed")) }),
    });
    const { disconnectUserSockets } = await import("@/utils/socket-emit");
    expect(() => disconnectUserSockets("1")).not.toThrow();
    expect(localDisconnect).toHaveBeenCalledWith(true);

    getIOMock.mockReturnValue({
      local: { in: () => ({ disconnectSockets: localDisconnect }) },
      in: () => {
        throw new Error("sync failure");
      },
    });
    expect(() => disconnectUserSockets("1")).not.toThrow();
  });

  it("emit helpers swallow throws and rejections", async () => {
    getIOMock.mockReturnValue({
      to: () => ({ emit: () => Promise.reject(new Error("publish failed")) }),
      emit: () => {
        throw new Error("boom");
      },
    });
    const { emitToUser, emitBroadcast } = await import("@/utils/socket-emit");
    expect(() => emitToUser("1", SOCKET_EVENT.PING, {})).not.toThrow();
    expect(() => emitBroadcast(SOCKET_EVENT.PING, {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});
