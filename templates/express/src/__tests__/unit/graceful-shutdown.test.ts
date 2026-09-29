import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SIGTERM must always finish shutdown: one failing close step (e.g. Redis QUIT while
 * Redis is down) is logged, the remaining steps still run, and the exit code reports it.
 * A hung step cannot stall shutdown past the deadline.
 */
const closeSocket = vi.fn();
const disconnectRedis = vi.fn();
const mongoClose = vi.fn();

vi.mock("@/socket", () => ({ closeSocket }));
vi.mock("@/config/redis", () => ({ disconnectRedis }));
vi.mock("mongoose", () => ({
  default: { connection: { close: mongoClose, on: vi.fn() }, set: vi.fn() },
}));

let exit: ReturnType<typeof vi.spyOn>;
let added: Array<["SIGINT" | "SIGTERM", (signal: string) => Promise<void>]>;
let shutdown: (signal: string) => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const before = {
    SIGINT: process.listeners("SIGINT"),
    SIGTERM: process.listeners("SIGTERM"),
  };
  await import("@/config/database");
  added = (["SIGINT", "SIGTERM"] as const).flatMap((signal) =>
    process
      .listeners(signal)
      .filter((l) => !before[signal].includes(l))
      .map((l) => [signal, l as (signal: string) => Promise<void>] as const),
  ) as typeof added;
  shutdown = added.find(([signal]) => signal === "SIGTERM")![1];
});

afterEach(() => {
  for (const [signal, l] of added) process.off(signal, l);
  exit.mockRestore();
  vi.useRealTimers();
});

describe("graceful shutdown", () => {
  it("exits 0 when every step closes cleanly", async () => {
    closeSocket.mockResolvedValue(undefined);
    mongoClose.mockResolvedValue(undefined);
    disconnectRedis.mockResolvedValue(undefined);

    await shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("runs every step and exits 1 when one throws", async () => {
    closeSocket.mockRejectedValue(new Error("socket boom"));
    mongoClose.mockResolvedValue(undefined);
    disconnectRedis.mockRejectedValue(new Error("Stream isn't writeable"));

    await shutdown("SIGTERM");

    expect(mongoClose).toHaveBeenCalledOnce();
    expect(disconnectRedis).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("exits 1 at the 10s deadline when a step hangs", async () => {
    vi.useFakeTimers();
    closeSocket.mockReturnValue(new Promise(() => {}));

    void shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("ignores a second signal while already shutting down", async () => {
    closeSocket.mockResolvedValue(undefined);
    mongoClose.mockResolvedValue(undefined);
    disconnectRedis.mockResolvedValue(undefined);

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

    expect(closeSocket).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });
});
