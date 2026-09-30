/**
 * SocketEmitService targeting: user room, broadcast, and disconnect scope; no-op before
 * the gateway server exists. (Failure swallowing is covered by redis-outage-safety.)
 */
import { describe, expect, it, vi } from "vitest";

import type { AppLogger } from "@/common/logger/app-logger.service";
import { SocketEmitService } from "@/modules/realtime/socket-emit.service";

function makeServer() {
  const emit = vi.fn();
  const disconnectSockets = vi.fn();
  const room = { emit, disconnectSockets };
  const server = {
    to: vi.fn(() => room),
    in: vi.fn(() => room),
    local: { in: vi.fn(() => room) },
    emit,
  };
  return { server, emit, disconnectSockets };
}

const logger = { warn: vi.fn() } as unknown as AppLogger;
const EVENT = "evt" as never;

describe("SocketEmitService", () => {
  it("emitToUser targets only the user's room", () => {
    const { server, emit } = makeServer();
    new SocketEmitService({ server } as never, logger).emitToUser("u1", EVENT, { a: 1 });
    expect(server.to).toHaveBeenCalledWith("user:u1");
    expect(emit).toHaveBeenCalledWith("evt", { a: 1 });
  });

  it("emitBroadcast emits on the server without a room", () => {
    const { server, emit } = makeServer();
    new SocketEmitService({ server } as never, logger).emitBroadcast(EVENT, 5);
    expect(server.to).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("evt", 5);
  });

  it("disconnectUser drops local sockets first, then the cluster-wide room", () => {
    const { server, disconnectSockets } = makeServer();
    new SocketEmitService({ server } as never, logger).disconnectUser("u1");
    expect(server.local.in).toHaveBeenCalledWith("user:u1");
    expect(server.in).toHaveBeenCalledWith("user:u1");
    expect(disconnectSockets).toHaveBeenCalledTimes(2);
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it("is a no-op while the gateway server is not initialized", () => {
    const warn = vi.fn();
    const svc = new SocketEmitService({ server: undefined } as never, { warn } as never);
    expect(() => {
      svc.emitToUser("u1", EVENT);
      svc.emitBroadcast(EVENT);
      svc.disconnectUser("u1");
    }).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});
