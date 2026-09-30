/**
 * server.ts boots on import and owns the SIGINT/SIGTERM handlers. The app, database and
 * Redis are stubbed so the test drives only the shutdown sequence: close order, exit
 * code, the 10s deadline and repeated signals.
 */
const app = { listen: vi.fn(), close: vi.fn() };
const connectDatabase = vi.fn();
const disconnectDatabase = vi.fn();
const connectRedis = vi.fn();
const disconnectRedis = vi.fn();

vi.mock("@/app", () => ({ buildApp: () => app }));
vi.mock("@/config/database", () => ({ connectDatabase, disconnectDatabase }));
vi.mock("@/config/redis", () => ({ connectRedis, disconnectRedis }));

// process.once wraps shutdown in `() => void shutdown(...)`, so the handler returns nothing to await.
type SignalHandler = (signal: string) => void;
type Signal = "SIGINT" | "SIGTERM";

let added: Array<[Signal, SignalHandler]>;
let exit: ReturnType<typeof vi.spyOn>;
let originalExitCode: typeof process.exitCode;

/** Import server.ts fresh and return the handler it registered for `signal`. */
async function boot(signal: Signal = "SIGTERM"): Promise<SignalHandler> {
  const before = { SIGINT: process.listeners("SIGINT"), SIGTERM: process.listeners("SIGTERM") };
  vi.resetModules();
  await import("@/server");
  await vi.waitFor(() => expect(app.listen).toHaveBeenCalled());
  await vi.waitFor(() => {
    added = (["SIGINT", "SIGTERM"] as const).flatMap((name) =>
      process
        .listeners(name)
        .filter((listener) => !before[name].includes(listener))
        .map((listener) => [name, listener as SignalHandler] as [Signal, SignalHandler]),
    );
    expect(added).toHaveLength(2);
  });
  return added.find(([name]) => name === signal)![1];
}

beforeEach(() => {
  vi.clearAllMocks();
  app.listen.mockResolvedValue(undefined);
  app.close.mockResolvedValue(undefined);
  disconnectDatabase.mockResolvedValue(undefined);
  disconnectRedis.mockResolvedValue(undefined);
  originalExitCode = process.exitCode;
  exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
});

afterEach(() => {
  for (const [name, listener] of added ?? []) process.off(name, listener);
  added = [];
  exit.mockRestore();
  process.exitCode = originalExitCode;
  vi.useRealTimers();
});

describe("graceful shutdown", () => {
  it("closes app, database and Redis in order and exits cleanly", async () => {
    const order: string[] = [];
    app.close.mockImplementation(async () => void order.push("app"));
    disconnectDatabase.mockImplementation(async () => void order.push("database"));
    disconnectRedis.mockImplementation(async () => void order.push("redis"));
    const shutdown = await boot();

    shutdown("SIGTERM");

    await vi.waitFor(() => expect(process.exitCode).toBe(0));
    expect(order).toEqual(["app", "database", "redis"]);
    expect(exit).not.toHaveBeenCalled();
  });

  it("reports exit code 1 when a close step fails", async () => {
    disconnectRedis.mockRejectedValue(new Error("Stream isn't writeable"));
    const shutdown = await boot();

    shutdown("SIGTERM");

    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(app.close).toHaveBeenCalledOnce();
    expect(disconnectDatabase).toHaveBeenCalledOnce();
  });

  it("still closes database and Redis when app.close throws", async () => {
    app.close.mockRejectedValue(new Error("close failed"));
    const shutdown = await boot();

    shutdown("SIGTERM");

    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(disconnectDatabase).toHaveBeenCalledOnce();
    expect(disconnectRedis).toHaveBeenCalledOnce();
  });

  it("forces exit 1 at the 10s deadline when a step hangs", async () => {
    const shutdown = await boot();
    vi.useFakeTimers();
    app.close.mockReturnValue(new Promise(() => {}));

    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("ignores a second signal while already shutting down", async () => {
    const shutdown = await boot();

    shutdown("SIGTERM");
    shutdown("SIGINT");

    await vi.waitFor(() => expect(process.exitCode).toBe(0));
    expect(app.close).toHaveBeenCalledOnce();
    expect(disconnectDatabase).toHaveBeenCalledOnce();
  });

  it("registers the same handler for SIGINT and SIGTERM", async () => {
    await boot();
    expect(added.map(([name]) => name).sort()).toEqual(["SIGINT", "SIGTERM"]);
  });

  it("releases app, database and Redis and fails boot when listen rejects", async () => {
    app.listen.mockRejectedValue(new Error("EADDRINUSE"));
    vi.resetModules();
    await import("@/server");

    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(app.close).toHaveBeenCalledOnce();
    expect(disconnectDatabase).toHaveBeenCalledOnce();
    expect(disconnectRedis).toHaveBeenCalledOnce();
  });
});
