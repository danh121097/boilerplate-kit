import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { SOCKET_EVENT } from "@/enums";
import { persistAccessToken } from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * Socket lifecycle through the public composable, with `socket.io-client`
 * replaced by an in-memory socket; the retry / refresh rules live in
 * `socket-connection.test.ts`. The composable relies on auto-imported Vue
 * APIs, provided as globals; it is run inside an effect scope, and
 * `connectSocket` is called directly (no component, so `onMounted` never fires).
 */
class FakeSocket {
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
  events() {
    return [...this.listeners].filter(([, cbs]) => cbs.size > 0).map(([event]) => event);
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

  it("does not connect while signed out", () => {
    localStorage.clear();
    const { api, socket } = mount();

    api.connectSocket();

    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("unmount cancels a pending retry", () => {
    const { api, socket, unmount } = mount();
    api.connectSocket();
    socket.connect.mockClear();
    socket.emit(SOCKET_EVENT.CONNECT_ERROR, new Error("boom"));

    unmount();
    vi.advanceTimersByTime(RECONNECT_MAX_MS * 2);

    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.events()).toHaveLength(0);
  });
});
