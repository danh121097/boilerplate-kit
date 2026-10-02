import { SOCKET_EVENT } from "@/enums";
import { getApiBaseUrl, getApiOrigin } from "@/services/core/api-config";
import { SessionEndedError } from "@/services/core/api-errors";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { refreshSession } from "@/services/core/interceptors";
import { createPinia, defineStore, setActivePinia, storeToRefs } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, onScopeDispose, ref } from "vue";

/**
 * `useSocketIO`: the connection is authenticated only once the server says so,
 * and a rejected handshake is retried on the same socket with a doubling delay
 * (a network error is left to socket.io's own reconnection).
 */

class FakeSocket {
  active = false;
  auth!: (cb: (data: Record<string, unknown>) => void) => void;
  connected = false;
  handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  connect = vi.fn(() => {
    this.connected = false;
  });
  disconnect = vi.fn();
  off = (event: string, fn: (...args: unknown[]) => void) => this.handlers.get(event)?.delete(fn);
  on = (event: string, fn: (...args: unknown[]) => void) => {
    this.handlers.set(event, (this.handlers.get(event) ?? new Set()).add(fn));
  };
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.forEach((fn) => fn(...args));
  }
}

const sockets: FakeSocket[] = [];
const ioUrls: string[] = [];
vi.mock("socket.io-client", () => ({
  io: (url: string, options: { auth: FakeSocket["auth"] }) => {
    const socket = new FakeSocket();
    socket.auth = options.auth;
    sockets.push(socket);
    ioUrls.push(url);
    return socket;
  },
}));
vi.mock("@/services/core/interceptors", () => ({ refreshSession: vi.fn() }));
const refresh = vi.mocked(refreshSession);

// The store module calls the auto-imported `defineStore` / `ref` when it loads.
vi.stubGlobal("defineStore", defineStore);
vi.stubGlobal("ref", ref);

const { useSocketIO } = await import("@/composables/useSocketIO");
const { useSocketIOStore } = await import("@/stores/socket-io");

let signCount = 0;

function mount() {
  const scope = effectScope();
  scope.run(() => useSocketIO());
  const socket = sockets.at(-1)!;
  const { ioStore } = storeToRefs(useSocketIOStore());
  return { scope, socket, state: ioStore };
}

const reject = (socket: FakeSocket) => socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("x"));
const unauthorized = new Error("Unauthorized!");
const refreshFailure = (status?: number, errorType?: string) =>
  Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    response: status ? { status, data: errorType ? { errorType } : {} } : undefined,
  });

/** The payload socket.io would send for one handshake. */
function handshake(socket: FakeSocket): Record<string, unknown> {
  const cb = vi.fn();
  socket.auth(cb);
  return cb.mock.calls[0]![0] as Record<string, unknown>;
}

describe("useSocketIO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sockets.length = 0;
    ioUrls.length = 0;
    refresh.mockReset();
    signCount = 0;
    setActivePinia(createPinia());
    vi.stubGlobal("defineStore", defineStore);
    vi.stubGlobal("storeToRefs", storeToRefs);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("useRuntimeConfig", () => ({ public: { appEndpoint: "http://api.test" } }));
    vi.stubGlobal("onMounted", (fn: () => void) => fn());
    vi.stubGlobal("onScopeDispose", onScopeDispose);
    vi.spyOn(HMACSignatureGenerator, "signRequest").mockImplementation(
      () => ({ sig: `sig-${++signCount}`, ctime: signCount }) as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is authenticated only after the server's authenticated event", () => {
    const { socket, state } = mount();

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(state.value.authenticated).toBe(false);

    socket.emit(SOCKET_EVENT.AUTHENTICATED);
    expect(state.value.authenticated).toBe(true);

    socket.emit(SOCKET_EVENT.DISCONNECT);
    expect(state.value.authenticated).toBe(false);
  });

  it("retries a rejected handshake after 2s then 4s on the same socket with fresh auth", () => {
    const { socket } = mount();
    const first = handshake(socket).sig;

    reject(socket);
    reject(socket); // an error while a retry is pending does not reschedule
    vi.advanceTimersByTime(1999);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(handshake(socket).sig).not.toBe(first);

    reject(socket);
    vi.advanceTimersByTime(3999);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(3);
    expect(sockets).toHaveLength(1);
  });

  it("retries after the server closes the socket, but not after a client disconnect", () => {
    const { socket, state } = mount();
    socket.emit(SOCKET_EVENT.AUTHENTICATED);

    socket.emit(SOCKET_EVENT.DISCONNECT, "io client disconnect");
    vi.advanceTimersByTime(60_000);
    expect(socket.connect).toHaveBeenCalledTimes(1);

    socket.emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");
    expect(state.value.authenticated).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it("caps the delay at 30s", () => {
    const { socket } = mount();
    for (const delay of [2000, 4000, 8000, 16_000, 30_000, 30_000]) {
      const before = socket.connect.mock.calls.length;
      reject(socket);
      vi.advanceTimersByTime(delay - 1);
      expect(socket.connect).toHaveBeenCalledTimes(before);
      vi.advanceTimersByTime(1);
      expect(socket.connect).toHaveBeenCalledTimes(before + 1);
    }
  });

  it("leaves reconnection to socket.io while the socket is active", () => {
    const { socket, state } = mount();
    socket.active = true;

    reject(socket);
    vi.advanceTimersByTime(60_000);

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(state.value.authenticated).toBe(false);
  });

  it("restarts the backoff from 2s after an authenticated event", () => {
    const { socket } = mount();
    reject(socket);
    vi.advanceTimersByTime(2000);
    reject(socket);
    vi.advanceTimersByTime(4000);
    expect(socket.connect).toHaveBeenCalledTimes(3);

    socket.emit(SOCKET_EVENT.AUTHENTICATED);
    reject(socket);
    vi.advanceTimersByTime(2000);
    expect(socket.connect).toHaveBeenCalledTimes(4);
  });

  it("signs the handshake anew on every connect: auth is a function with a fresh ctime", () => {
    const { socket } = mount();
    expect(typeof socket.auth).toBe("function");
    const [a, b] = [handshake(socket), handshake(socket)];
    expect(b.ctime).toBeGreaterThan(a.ctime as number);
    expect(b.sig).not.toBe(a.sig);
  });

  it("sends only { sig, ctime }: no role, no token (the httpOnly cookie authenticates)", () => {
    const { socket } = mount();
    expect(Object.keys(handshake(socket)).sort()).toEqual(["ctime", "sig"]);
  });

  it("connects to the HTTP origin even when no endpoint is configured", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({ public: {} }));
    mount();
    expect(ioUrls[0]).toBe(getApiOrigin());
    expect(getApiBaseUrl().startsWith(getApiOrigin())).toBe(true);
    expect(getApiOrigin()).toBe("http://localhost:3000");
  });

  it("registers listeners only for the events the backend emits", () => {
    const { socket } = mount();
    expect([...socket.handlers.keys()].sort()).toEqual(
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
    const { socket } = mount();
    socket.connect.mockClear();

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
    await vi.advanceTimersByTimeAsync(0);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("an HMAC_ERROR rejection never refreshes: backoff reconnect with a fresh signature", async () => {
    const { socket } = mount();
    socket.connect.mockClear();
    const first = handshake(socket).sig;
    const hmacRejected = Object.assign(new Error("Unauthorized!"), {
      data: { errorType: "HMAC_ERROR" },
    });

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, hmacRejected);
    await vi.advanceTimersByTimeAsync(1999);
    expect(socket.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(handshake(socket).sig).not.toBe(first);

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, hmacRejected);
    await vi.advanceTimersByTimeAsync(3999);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("HMAC_ERROR rejections do not spend the refresh budget for later token rejections", async () => {
    refresh.mockResolvedValue(undefined);
    const { socket } = mount();
    const hmacRejected = Object.assign(new Error("Unauthorized!"), {
      data: { errorType: "HMAC_ERROR" },
    });
    for (let i = 0; i < 4; i += 1) {
      socket.emit(SOCKET_EVENT.CONNECT_ERROR, hmacRejected);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("an Unauthorized! carrying unrelated data still refreshes like a token rejection", async () => {
    refresh.mockResolvedValue(undefined);
    const { socket } = mount();
    socket.emit(
      SOCKET_EVENT.CONNECT_ERROR,
      Object.assign(new Error("Unauthorized!"), { data: { errorType: "OTHER" } }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while socket.io is already reconnecting (network error)", async () => {
    const { socket } = mount();
    socket.active = true;
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a rejection other than Unauthorized backs off without refreshing", async () => {
    const { socket } = mount();
    socket.connect.mockClear();
    reject(socket);
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).not.toHaveBeenCalled();
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a refused refresh", refreshFailure(401)],
    ["an ended session", new SessionEndedError()],
  ])("%s stops: no reconnect, no retry", async (_label, failure) => {
    refresh.mockRejectedValue(failure);
    const { socket } = mount();
    socket.connect.mockClear();

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a rejected signature (401 HMAC_ERROR) on refresh is transient: backoff, not stop", async () => {
    refresh.mockRejectedValue(refreshFailure(401, "HMAC_ERROR"));
    const { socket } = mount();
    socket.connect.mockClear();

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
    await vi.advanceTimersByTimeAsync(2000);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("a transient refresh failure retries with backoff, capped at 3 refreshes per outage", async () => {
    refresh.mockRejectedValue(refreshFailure());
    const { socket } = mount();
    socket.connect.mockClear();

    for (let i = 0; i < 6; i += 1) {
      socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
      await vi.advanceTimersByTimeAsync(30_000);
    }

    expect(refresh).toHaveBeenCalledTimes(3);
    // Every rejection is still retried (3 after a failed refresh, 3 plain backoffs).
    expect(socket.connect).toHaveBeenCalledTimes(6);
  });

  it("a successful authentication resets the refresh budget", async () => {
    refresh.mockRejectedValue(refreshFailure());
    const { socket } = mount();
    for (let i = 0; i < 3; i += 1) {
      socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    socket.emit(SOCKET_EVENT.AUTHENTICATED);

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("disposing the scope removes the listeners and ignores a late refresh", async () => {
    let finish!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { scope, socket } = mount();
    socket.connect.mockClear();
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);

    scope.stop();
    finish();
    await vi.advanceTimersByTimeAsync(120_000);

    expect([...socket.handlers.values()].flatMap((set) => [...set])).toEqual([]);
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("destroySocket while a refresh is pending: the late result does not reconnect", async () => {
    let finish!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    let destroy!: () => void;
    const scope = effectScope();
    scope.run(() => {
      destroy = useSocketIO().destroySocket;
    });
    const socket = sockets.at(-1)!;
    socket.connect.mockClear();
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, unauthorized);

    destroy();
    finish();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(socket.connect).not.toHaveBeenCalled();
    scope.stop();
  });

  it("cancels a pending retry when the scope is disposed", () => {
    const { scope, socket } = mount();
    reject(socket);

    scope.stop();
    vi.advanceTimersByTime(60_000);

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
