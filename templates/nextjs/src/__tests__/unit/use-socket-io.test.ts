import { SOCKET_EVENT } from "@/enums";
import { useSocketIO } from "@/hooks/useSocketIO";
import { getApiBaseUrl, getApiOrigin } from "@/services/core/api-config";
import { SessionEndedError } from "@/services/core/api-errors";
import { refreshSession } from "@/services/core/session-refresher";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Socket.IO hook driven without a renderer: `react` is reduced to the two hooks
 * it uses (effects re-run when their deps change, like a re-render), the store is
 * a plain object, and `socket.io-client` is a fake socket whose `connect_error` /
 * `authenticated` / `disconnect` the tests fire by hand.
 */

type Handler = (...args: never[]) => void;

class FakeSocket {
  active = false;
  connected = false;
  handlers = new Map<string, Handler[]>();
  connect = vi.fn(() => void (this.connected = false));
  disconnect = vi.fn();
  on = vi.fn((event: string, fn: Handler) => {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
  });
  off = vi.fn((event: string, fn: Handler) => {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter((h) => h !== fn),
    );
  });
  fire(event: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(event) ?? []) (fn as (...a: unknown[]) => void)(...args);
  }
}

const mocks = vi.hoisted(() => ({
  effects: [] as { cleanup?: () => void; deps?: unknown[] }[],
  cursor: 0,
  refs: [] as { current: unknown }[],
  refCursor: 0,
  sockets: [] as unknown[],
  io: vi.fn(),
  state: { socket: null as unknown, authenticated: false },
}));

vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => (mocks.refs[mocks.refCursor++] ??= { current }),
  useEffect: (fn: () => (() => void) | undefined, deps: unknown[]) => {
    const slot = (mocks.effects[mocks.cursor] ??= {});
    mocks.cursor += 1;
    if (slot.deps && deps.every((dep, i) => Object.is(dep, slot.deps![i]))) return;
    slot.cleanup?.();
    slot.deps = deps;
    slot.cleanup = fn();
  },
}));

vi.mock("@/stores/socket-io", () => {
  const useSocketIOStore = Object.assign(() => ({ ...mocks.state, setSocketIO }), {
    getState: () => mocks.state,
  });
  function setSocketIO(data: Partial<typeof mocks.state>) {
    Object.assign(mocks.state, data);
  }
  return { useSocketIOStore };
});

vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("@/services/core/session-refresher", () => ({ refreshSession: vi.fn() }));

const refresh = vi.mocked(refreshSession);
const refreshFailure = (status?: number) =>
  Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    response: status ? { status, data: {} } : undefined,
  });

/** One render pass; effects whose deps are unchanged do not re-run. */
function render() {
  mocks.cursor = 0;
  mocks.refCursor = 0;
  // The hook runs outside React here: `react` is stubbed to the hooks it uses.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSocketIO();
}

/** The hook's current return value (another render pass; unchanged effects do not re-run). */
const useSocketIOResult = render;

function unmount() {
  for (const slot of mocks.effects) slot.cleanup?.();
  mocks.effects.length = 0;
}

async function mount() {
  render();
  // The socket is created after a lazy import; the second render attaches to it.
  await vi.advanceTimersByTimeAsync(0);
  render();
  const sock = mocks.sockets.at(-1) as FakeSocket;
  const options = mocks.io.mock.calls.at(-1)![1] as {
    auth: (cb: (data: Record<string, unknown>) => void) => void;
  };
  return { sock, options };
}

const unauthorized = new Error("Unauthorized!");

describe("useSocketIO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    mocks.effects.length = 0;
    mocks.refs.length = 0;
    mocks.state.socket = null;
    mocks.state.authenticated = false;
    mocks.sockets.length = 0;
    mocks.io.mockReset();
    mocks.io.mockImplementation(() => {
      const sock = new FakeSocket();
      mocks.sockets.push(sock);
      return sock;
    });
    refresh.mockReset();
  });

  afterEach(() => {
    unmount();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("signs the handshake anew on every connect: auth is a function with a fresh ctime", async () => {
    const { options } = await mount();
    expect(typeof options.auth).toBe("function");

    const first = vi.fn();
    options.auth(first);
    await vi.advanceTimersByTimeAsync(1000);
    const second = vi.fn();
    options.auth(second);

    const [a, b] = [first.mock.calls[0]![0], second.mock.calls[0]![0]];
    expect(b.ctime).toBeGreaterThan(a.ctime);
    expect(b.sig).not.toBe(a.sig);
  });

  it("sends only { sig, ctime }: no role, no token (the httpOnly cookie authenticates)", async () => {
    const cb = vi.fn();

    const { options } = await mount();
    options.auth(cb);
    expect(Object.keys(cb.mock.calls[0]![0]).sort()).toEqual(["ctime", "sig"]);
  });

  it("connects to the HTTP origin even when no endpoint env is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENDPOINT", "");
    await mount();
    expect(mocks.io.mock.calls[0]![0]).toBe(getApiOrigin());
    expect(getApiBaseUrl().startsWith(getApiOrigin())).toBe(true);
    expect(getApiOrigin()).toBe("http://localhost:3000");
  });

  it("opens the connection without requiring a token", async () => {
    const { sock } = await mount();
    expect(sock.connect).toHaveBeenCalledTimes(1);
  });

  it("registers listeners only for the events the backend emits", async () => {
    const { sock } = await mount();
    expect([...sock.handlers.keys()].sort()).toEqual(
      [SOCKET_EVENT.AUTHENTICATED, SOCKET_EVENT.CONNECT_ERROR, SOCKET_EVENT.DISCONNECT].sort(),
    );
    expect(Object.keys(SOCKET_EVENT)).toEqual([
      "AUTHENTICATED",
      "PING",
      "DISCONNECT",
      "CONNECT_ERROR",
    ]);
  });

  it('"Unauthorized!" refreshes the session once, then reconnects once', async () => {
    refresh.mockResolvedValue(undefined);
    const { sock } = await mount();
    sock.connect.mockClear();

    sock.fire("connect_error", unauthorized);
    await vi.advanceTimersByTimeAsync(0);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sock.connect).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while socket.io is already reconnecting (network error)", async () => {
    const { sock } = await mount();
    sock.active = true;
    sock.fire("connect_error", unauthorized);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a rejection other than Unauthorized backs off without refreshing", async () => {
    const { sock } = await mount();
    sock.connect.mockClear();
    sock.fire("connect_error", new Error("xhr poll error"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).not.toHaveBeenCalled();
    expect(sock.connect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a refused refresh", refreshFailure(401)],
    ["an ended session", new SessionEndedError()],
  ])("%s stops: no reconnect, no retry", async (_label, failure) => {
    refresh.mockRejectedValue(failure);
    const { sock } = await mount();
    sock.connect.mockClear();

    sock.fire("connect_error", unauthorized);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(sock.connect).not.toHaveBeenCalled();
    expect(sock.disconnect).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a rejected signature (401 HMAC_ERROR) on refresh is transient: backoff, not stop", async () => {
    const hmac = Object.assign(refreshFailure(401), {
      response: { status: 401, data: { errorType: "HMAC_ERROR" } },
    });
    refresh.mockRejectedValue(hmac);
    const { sock } = await mount();
    sock.connect.mockClear();

    sock.fire("connect_error", unauthorized);
    await vi.advanceTimersByTimeAsync(2000);

    expect(sock.disconnect).not.toHaveBeenCalled();
    expect(sock.connect).toHaveBeenCalledTimes(1);
  });

  it("a transient refresh failure retries with backoff, capped at 3 refreshes per outage", async () => {
    refresh.mockRejectedValue(refreshFailure());
    const { sock } = await mount();
    sock.connect.mockClear();

    for (let i = 0; i < 6; i += 1) {
      sock.fire("connect_error", unauthorized);
      await vi.advanceTimersByTimeAsync(30_000);
    }

    expect(refresh).toHaveBeenCalledTimes(3);
    // Every rejection is still retried (3 after a failed refresh, 3 plain backoffs).
    expect(sock.connect).toHaveBeenCalledTimes(6);
  });

  it("a successful authentication resets the refresh budget", async () => {
    refresh.mockRejectedValue(refreshFailure());
    const { sock } = await mount();
    for (let i = 0; i < 3; i += 1) {
      sock.fire("connect_error", unauthorized);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    sock.fire("authenticated");

    sock.fire("connect_error", unauthorized);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("unmount removes the listeners, clears the retry timer and ignores a late refresh", async () => {
    let finish!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { sock } = await mount();
    sock.connect.mockClear();
    sock.fire("connect_error", unauthorized);

    unmount();
    finish();
    await vi.advanceTimersByTimeAsync(120_000);

    expect([...sock.handlers.values()].flat()).toEqual([]);
    expect(sock.connect).not.toHaveBeenCalled();
  });

  it("destroying the socket while a refresh is pending: the late refresh does not reconnect", async () => {
    let finish!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { sock } = await mount();
    sock.connect.mockClear();
    sock.fire("connect_error", unauthorized);

    const destroy = useSocketIOResult().destroySocket;
    destroy();
    finish();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(sock.connect).not.toHaveBeenCalled();
  });

  it("destroying the socket clears a pending retry timer", async () => {
    const { sock } = await mount();
    sock.connect.mockClear();
    sock.fire("connect_error", new Error("xhr poll error"));

    useSocketIOResult().destroySocket();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(sock.connect).not.toHaveBeenCalled();
  });
});
