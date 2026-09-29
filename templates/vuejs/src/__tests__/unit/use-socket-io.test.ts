import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { SOCKET_EVENT } from "@/enums";
import { persistAccessToken } from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * Socket lifecycle through the public composable, with `socket.io-client`
 * replaced by an in-memory socket. The composable relies on auto-imported Vue
 * APIs, provided as globals; it is run inside an effect scope, and
 * `connectSocket` is called directly (no component, so `onMounted` never fires).
 */
class FakeSocket {
  auth: Record<string, unknown> = {};
  active = false;
  connected = false;
  connect = vi.fn();
  disconnect = vi.fn(() => {
    this.connected = false;
  });
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, cb: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }
  off(event: string, cb: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(cb);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }
}

const sockets: FakeSocket[] = [];
vi.mock("socket.io-client", () => ({
  io: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));

let useSocketIO: typeof import("@/composables/useSocketIO").useSocketIO;

/** Backoff the composable is expected to use: 2s doubling, capped at 30s. */
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30_000;
let useSocketIOStore: typeof import("@/stores/socket-io").useSocketIOStore;

function mount() {
  const store = useSocketIOStore();

  const scope = vue.effectScope();
  const api = scope.run(() => useSocketIO())!;
  const socket = sockets.at(-1)!;
  return { api, socket, store, unmount: () => scope.stop() };
}

describe("useSocketIO", () => {
  beforeAll(async () => {
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("onMounted", () => {});
    vi.stubGlobal("onScopeDispose", vue.onScopeDispose);
    vi.stubGlobal("storeToRefs", pinia.storeToRefs);
    ({ useSocketIO } = await import("@/composables/useSocketIO"));
    ({ useSocketIOStore } = await import("@/stores/socket-io"));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    sockets.length = 0;
    persistAccessToken("AT1", "MAIN");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is authenticated only once the server emits authenticated", () => {
    const { api, socket, store } = mount();

    api.connectSocket();
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(store.ioStore.authenticated).toBe(false);

    socket.emit(SOCKET_EVENT.AUTHENTICATED);
    expect(store.ioStore.authenticated).toBe(true);

    socket.emit(SOCKET_EVENT.DISCONNECT);
    expect(store.ioStore.authenticated).toBe(false);
  });

  it("retries a rejected handshake at 2s then 4s on the same socket with fresh auth", () => {
    const { api, socket, store } = mount();
    api.connectSocket();
    socket.connect.mockClear();

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!"));
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!")); // pending: no reschedule
    expect(store.ioStore.authenticated).toBe(false);
    vi.advanceTimersByTime(RECONNECT_BASE_MS - 1);
    expect(socket.connect).not.toHaveBeenCalled();

    persistAccessToken("AT2", "MAIN");
    vi.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.auth).toMatchObject({ token: "Bearer AT2" });

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!"));
    vi.advanceTimersByTime(RECONNECT_BASE_MS * 2 - 1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(1);
  });

  it("retries after the server closes the socket, but not after a client disconnect", () => {
    const { api, socket, store } = mount();
    api.connectSocket();
    socket.emit(SOCKET_EVENT.AUTHENTICATED);
    socket.connect.mockClear();

    socket.emit(SOCKET_EVENT.DISCONNECT, "io client disconnect");
    vi.advanceTimersByTime(RECONNECT_MAX_MS * 2);
    expect(socket.connect).not.toHaveBeenCalled();

    socket.emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");
    expect(store.ioStore.authenticated).toBe(false);
    vi.advanceTimersByTime(RECONNECT_BASE_MS);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("caps the retry delay at the maximum", () => {
    const { api, socket } = mount();
    api.connectSocket();
    // 2s, 4s, 8s, 16s, then 30s.
    for (const delay of [2000, 4000, 8000, 16000, RECONNECT_MAX_MS]) {
      socket.connect.mockClear();
      socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!"));
      vi.advanceTimersByTime(delay - 1);
      expect(socket.connect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(socket.connect).toHaveBeenCalledTimes(1);
    }
  });

  it("leaves reconnecting to socket.io while the socket is active", () => {
    const { api, socket } = mount();
    api.connectSocket();
    socket.connect.mockClear();
    socket.active = true;

    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("xhr poll error"));
    vi.advanceTimersByTime(RECONNECT_MAX_MS * 2);

    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("resets the backoff after authenticated", () => {
    const { api, socket } = mount();
    api.connectSocket();
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!"));
    vi.advanceTimersByTime(RECONNECT_BASE_MS);
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!"));
    vi.advanceTimersByTime(RECONNECT_BASE_MS * 2);

    socket.emit(SOCKET_EVENT.AUTHENTICATED);
    socket.connect.mockClear();
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!"));

    vi.advanceTimersByTime(RECONNECT_BASE_MS);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("unmount cancels a pending retry", () => {
    const { api, socket, unmount } = mount();
    api.connectSocket();
    socket.connect.mockClear();
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("Unauthorized!"));

    unmount();
    vi.advanceTimersByTime(RECONNECT_MAX_MS * 2);

    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
