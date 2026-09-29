import { SOCKET_EVENT } from "@/enums";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
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
  auth: Record<string, unknown> = {};
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
vi.mock("socket.io-client", () => ({
  io: (_url: string, options: { auth: Record<string, unknown> }) => {
    const socket = new FakeSocket();
    socket.auth = options.auth;
    sockets.push(socket);
    return socket;
  },
}));

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

describe("useSocketIO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sockets.length = 0;
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
    const first = socket.auth.sig;

    reject(socket);
    reject(socket); // an error while a retry is pending does not reschedule
    vi.advanceTimersByTime(1999);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(socket.auth.sig).not.toBe(first);

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

  it("cancels a pending retry when the scope is disposed", () => {
    const { scope, socket } = mount();
    reject(socket);

    scope.stop();
    vi.advanceTimersByTime(60_000);

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
