import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { SOCKET_EVENT } from "@/enums";
import { Api, ApiInterceptors, getApiBaseUrl, onSessionEnded } from "@/services/core";
import {
  getAccessToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import {
  attachSocketLifecycle,
  connectSocket,
  createSocket,
  MAX_REFRESH_ATTEMPTS,
  RECONNECT_BASE_MS,
} from "@/services/core/socket-connection";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import axios from "axios";

/**
 * Socket handshake + reconnect rules, with the real refresh manager (the bare
 * refresh client's `axios.post` is stubbed) and a fake socket.io transport.
 */

const mocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: mocks.io }));

type Handler = (...args: never[]) => void;

function fakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const socket = {
    active: false,
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
    }),
  };
  const emit = (event: string, ...args: unknown[]) =>
    handlers.get(event)?.forEach((h) => (h as (...a: unknown[]) => void)(...args));
  return { socket, emit, handlers };
}

const NEW_TOKEN = {
  data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
} as never;
const rejected = new Error("Unauthorized!");

function refreshFailure(status?: number) {
  return Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    response: status ? { status, data: {} } : undefined,
  });
}

/** The `(url, options)` the latest `io()` call received. */
function ioCall() {
  const [url, options] = mocks.io.mock.calls.at(-1) as [
    string,
    { auth: (cb: (data: Record<string, unknown>) => void) => void },
  ];
  return { url, auth: options.auth };
}

function setup() {
  const onAuthenticated = vi.fn();

  const { socket, handlers, emit } = fakeSocket();

  const lifecycle = attachSocketLifecycle(socket as never, onAuthenticated);
  onTestFinished(lifecycle.detach);
  return { socket, emit, handlers, onAuthenticated, lifecycle };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("socket connection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    installLocalStorage();
    vi.stubEnv("VITE_HMAC_SECRET", "");
    Api.setBaseURL("http://api.test", "MAIN");
    new ApiInterceptors({ MAIN: { endpoint: "/auth/refresh" } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mocks.io.mockReset();
  });

  describe("handshake", () => {
    it("auth is a function that signs afresh on every call", () => {
      vi.stubEnv("VITE_HMAC_SECRET", "secret");
      persistAccessToken("TOKEN");
      createSocket();
      const { auth } = ioCall();

      const first = vi.fn();
      auth(first);
      vi.advanceTimersByTime(5);
      const second = vi.fn();
      auth(second);

      const [a, b] = [first.mock.calls[0]![0], second.mock.calls[0]![0]];
      expect(a).toMatchObject({ token: "Bearer TOKEN", sig: expect.any(String) });
      expect(b.ctime).toBeGreaterThan(a.ctime);
      expect(b.sig).not.toBe(a.sig);
    });

    it("sends neither an empty Bearer nor a client-asserted role", () => {
      const auth = () => {
        const cb = vi.fn();
        ioCall().auth(cb);
        return cb.mock.calls[0]![0] as Record<string, unknown>;
      };
      createSocket();

      expect(auth()).not.toHaveProperty("token");
      expect(auth()).not.toHaveProperty("role");

      persistAccessToken("TOKEN");
      expect(auth()).toEqual({ token: "Bearer TOKEN" });
    });

    it("connects to the HTTP origin when VITE_APP_ENDPOINT is unset", () => {
      vi.stubEnv("VITE_APP_ENDPOINT", "");
      createSocket();
      expect(getApiBaseUrl().startsWith(ioCall().url)).toBe(true);
      expect(ioCall().url).toBe("http://localhost:3000");
    });

    it("does not connect without an access token", () => {
      const { socket } = fakeSocket();
      expect(connectSocket(socket as never)).toBe(false);
      expect(socket.connect).not.toHaveBeenCalled();

      persistAccessToken("TOKEN");
      expect(connectSocket(socket as never)).toBe(true);
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("listeners", () => {
    it("registers only the events the backend emits plus the socket.io built-ins", () => {
      const { handlers } = setup();
      expect([...handlers.keys()].sort()).toEqual(
        [SOCKET_EVENT.AUTHENTICATED, SOCKET_EVENT.CONNECT_ERROR, SOCKET_EVENT.DISCONNECT].sort(),
      );
      expect(Object.values(SOCKET_EVENT)).not.toContain("unauthorized");
      expect(Object.values(SOCKET_EVENT)).not.toContain("notification");
    });

    it("detach removes every listener and pending timer", () => {
      const { handlers, socket, lifecycle, emit } = setup();
      persistAccessToken("TOKEN");
      emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");

      lifecycle.detach();
      vi.advanceTimersByTime(60_000);

      expect([...handlers.values()].every((set) => set.size === 0)).toBe(true);
      expect(socket.connect).not.toHaveBeenCalled();
    });
  });

  describe("rejected handshake", () => {
    beforeEach(() => {
      persistAccessToken("OLD");
      persistRefreshToken("RT");
    });

    it('"Unauthorized!" refreshes once and reconnects once with the new token', async () => {
      const post = vi.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

      const { socket, emit, onAuthenticated } = setup();

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();

      expect(post).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBe("NEW");
      expect(socket.connect).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).toHaveBeenCalledWith(false);
    });

    it("does nothing extra while socket.io is auto-reconnecting", async () => {
      const post = vi.spyOn(axios, "post");

      const { socket, emit } = setup();
      socket.active = true;

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(post).not.toHaveBeenCalled();
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it("a refused refresh ends the session and never reconnects", async () => {
      vi.spyOn(axios, "post").mockRejectedValue(refreshFailure(401));
      const ended = vi.fn();
      onTestFinished(onSessionEnded(ended));
      const { socket, emit } = setup();

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(ended).toHaveBeenCalledWith("expired", "MAIN");
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it("a refresh rejected for its signature keeps the session and backs off", async () => {
      vi.spyOn(axios, "post").mockRejectedValue(
        Object.assign(refreshFailure(401), {
          response: { status: 401, data: { errorType: "HMAC_ERROR" } },
        }),
      );
      const ended = vi.fn();
      onTestFinished(onSessionEnded(ended));
      const { socket, emit } = setup();

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();
      expect(socket.connect).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);

      expect(ended).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe("OLD");
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it("a transient refresh failure backs off and caps consecutive refreshes", async () => {
      const post = vi.spyOn(axios, "post").mockRejectedValue(refreshFailure());

      const { socket, emit } = setup();

      for (let outage = 0; outage < MAX_REFRESH_ATTEMPTS + 2; outage += 1) {
        emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
        await vi.advanceTimersByTimeAsync(30_000);
      }

      expect(post).toHaveBeenCalledTimes(MAX_REFRESH_ATTEMPTS);
      // every rejection was retried by the backoff timer, the last two without a refresh
      expect(socket.connect).toHaveBeenCalledTimes(MAX_REFRESH_ATTEMPTS + 2);
      expect(getAccessToken()).toBe("OLD");
    });

    it("the refresh budget resets once the server authenticates", async () => {
      const post = vi.spyOn(axios, "post").mockRejectedValue(refreshFailure());

      const { emit } = setup();

      for (let i = 0; i < MAX_REFRESH_ATTEMPTS; i += 1) {
        emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
        await vi.advanceTimersByTimeAsync(30_000);
      }
      emit(SOCKET_EVENT.AUTHENTICATED);
      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();

      expect(post).toHaveBeenCalledTimes(MAX_REFRESH_ATTEMPTS + 1);
    });

    it("a rejection other than Unauthorized! only backs off", async () => {
      const post = vi.spyOn(axios, "post");

      const { socket, emit } = setup();

      emit(SOCKET_EVENT.CONNECT_ERROR, new Error("boom"));
      await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);

      expect(post).not.toHaveBeenCalled();
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it("stop cancels a refresh still in flight", async () => {
      let resolve!: (value: never) => void;
      vi.spyOn(axios, "post").mockReturnValue(new Promise((r) => (resolve = r)));
      const { socket, lifecycle, emit } = setup();

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();
      lifecycle.stop();
      resolve(NEW_TOKEN);
      await flush();

      expect(socket.connect).not.toHaveBeenCalled();
    });

    it("does not refresh or reconnect when signed out", async () => {
      localStorage.clear();
      const post = vi.spyOn(axios, "post");
      const { socket, emit } = setup();

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(post).not.toHaveBeenCalled();
      expect(socket.connect).not.toHaveBeenCalled();
    });
  });

  describe("server disconnect", () => {
    it("retries with backoff, doubling the delay", async () => {
      persistAccessToken("TOKEN");
      const { socket, emit } = setup();

      emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");
      await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
      expect(socket.connect).toHaveBeenCalledTimes(1);

      emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");
      await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
      expect(socket.connect).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
      expect(socket.connect).toHaveBeenCalledTimes(2);
    });
  });
});
