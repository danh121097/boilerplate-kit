import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SIGTERM must always finish shutdown: one failing close step (e.g. Redis QUIT while
 * Redis is down) is logged and the remaining steps still run before a clean exit.
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
let listeners: Array<(signal: "SIGTERM") => void>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const before = process.listeners("SIGTERM");
  await import("@/config/database");
  listeners = process.listeners("SIGTERM").filter((l) => !before.includes(l));
});

afterEach(() => {
  for (const l of listeners) process.off("SIGTERM", l);
  for (const l of process.listeners("SIGINT").slice(-1)) process.off("SIGINT", l);
  exit.mockRestore();
});

describe("graceful shutdown", () => {
  it("runs every step and exits 0 even when one throws", async () => {
    closeSocket.mockRejectedValue(new Error("socket boom"));
    mongoClose.mockResolvedValue(undefined);
    disconnectRedis.mockRejectedValue(new Error("Stream isn't writeable"));

    await listeners[0]("SIGTERM");

    expect(mongoClose).toHaveBeenCalledOnce();
    expect(disconnectRedis).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
