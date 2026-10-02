import { fakeSecureStore, resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { SOCKET_EVENT } from "@/enums";
import { Api, ApiInterceptors, getApiBaseUrl, onSessionEnded } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import {
  attachSocketLifecycle,
  connectSocket,
  createSocket,
  MAX_REFRESH_ATTEMPTS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from "@/services/core/socket-connection";
import { io } from "socket.io-client";
import axios from "axios";
import * as SecureStore from "expo-secure-store";

/**
 * Socket handshake + reconnect rules, with the real refresh manager (the bare
 * refresh client's `axios.post` is stubbed), SecureStore faked in memory and a
 * fake socket.io transport.
 */

jest.mock("expo-secure-store", () => {
  const fake = require("@/__tests__/helpers/fake-secure-store").fakeSecureStore();
  // A mock fn (not the plain function) so a test can make one read fail.
  return { ...fake, getItemAsync: jest.fn() };
});
jest.mock("socket.io-client", () => ({ io: jest.fn() }));

type Handler = (...args: never[]) => void;

function fakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const socket = {
    active: false,
    connected: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn((event: string, handler: Handler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
    }),
    off: jest.fn((event: string, handler: Handler) => {
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

type SocketAuthData = Record<string, unknown>;

/** The `(url, options)` the latest `io()` call received. */
function ioCall() {
  const [url, options] = (io as unknown as jest.Mock).mock.calls.at(-1) as [
    string,
    { auth: (cb: (data: SocketAuthData) => void) => void },
  ];
  return { url, auth: options.auth };
}

/** Run the socket's `auth` callback once and resolve to the payload it produced. */
function handshake(): Promise<SocketAuthData> {
  return new Promise((resolve) => ioCall().auth(resolve));
}

function setup() {
  const onAuthenticated = jest.fn();

  const { socket, handlers, emit } = fakeSocket();

  const lifecycle = attachSocketLifecycle(socket as never, onAuthenticated);
  return { socket, emit, handlers, onAuthenticated, lifecycle };
}

const flush = () => jest.advanceTimersByTimeAsync(0);

describe("socket connection", () => {
  let lifecycles: Array<{ detach: () => void }> = [];
  let unsubscribe: Array<() => void> = [];

  const ENV_KEYS = ["EXPO_PUBLIC_HMAC_SECRET", "EXPO_PUBLIC_APP_ENDPOINT"] as const;
  const envSnapshot: Record<string, string | undefined> = {};

  const track = <T extends { lifecycle: { detach: () => void } }>(made: T): T => {
    lifecycles.push(made.lifecycle);
    return made;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    resetSecureStore();
    jest.mocked(SecureStore.getItemAsync).mockImplementation(fakeSecureStore().getItemAsync);
    ENV_KEYS.forEach((k) => (envSnapshot[k] = process.env[k]));
    delete process.env.EXPO_PUBLIC_HMAC_SECRET;
    Api.setBaseURL("http://api.test", "MAIN");
    new ApiInterceptors({ MAIN: { endpoint: "/auth/refresh" } });
  });

  afterEach(() => {
    lifecycles.forEach((l) => l.detach());
    unsubscribe.forEach((u) => u());
    lifecycles = [];
    unsubscribe = [];
    jest.useRealTimers();
    jest.restoreAllMocks();
    (io as unknown as jest.Mock).mockReset();
    ENV_KEYS.forEach((k) => {
      if (envSnapshot[k] === undefined) delete process.env[k];
      else process.env[k] = envSnapshot[k];
    });
  });

  describe("handshake", () => {
    it("auth is a function that signs afresh on every call", async () => {
      process.env.EXPO_PUBLIC_HMAC_SECRET = "secret";
      await persistAccessToken("TOKEN");
      createSocket();

      const a = await handshake();
      jest.advanceTimersByTime(5);
      const b = await handshake();

      expect(a).toMatchObject({ token: "Bearer TOKEN", sig: expect.any(String) });
      expect(b.ctime as number).toBeGreaterThan(a.ctime as number);
      expect(b.sig).not.toBe(a.sig);
    });

    it("reads the access token afresh on every call", async () => {
      createSocket();
      await persistAccessToken("OLD");
      expect(await handshake()).toEqual({ token: "Bearer OLD" });

      await persistAccessToken("NEW");
      expect(await handshake()).toEqual({ token: "Bearer NEW" });
    });

    it("sends neither an empty Bearer nor a client-asserted role", async () => {
      createSocket();

      const signedOut = await handshake();
      expect(signedOut).not.toHaveProperty("token");
      expect(signedOut).not.toHaveProperty("role");

      await persistAccessToken("TOKEN");
      expect(await handshake()).toEqual({ token: "Bearer TOKEN" });
    });

    it("still answers the handshake, empty, when the SecureStore read fails", async () => {
      createSocket();
      jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("keychain locked"));

      expect(await handshake()).toEqual({});
    });

    it("connects to the HTTP origin when EXPO_PUBLIC_APP_ENDPOINT is unset", () => {
      delete process.env.EXPO_PUBLIC_APP_ENDPOINT;
      createSocket();
      expect(getApiBaseUrl().startsWith(ioCall().url)).toBe(true);
      expect(ioCall().url).toBe("http://localhost:3000");
    });

    it("does not connect without an access token", async () => {
      const { socket } = fakeSocket();
      await expect(connectSocket(socket as never)).resolves.toBe(false);
      expect(socket.connect).not.toHaveBeenCalled();

      await persistAccessToken("TOKEN");
      await expect(connectSocket(socket as never)).resolves.toBe(true);
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it("does not connect when the connect went stale during the token read", async () => {
      await persistAccessToken("TOKEN");
      const { socket } = fakeSocket();

      await expect(connectSocket(socket as never, () => true)).resolves.toBe(false);
      expect(socket.connect).not.toHaveBeenCalled();
    });
  });

  describe("listeners", () => {
    it("registers only the events the backend emits plus the socket.io built-ins", () => {
      const { handlers } = track(setup());
      expect([...handlers.keys()].sort()).toEqual(
        [SOCKET_EVENT.AUTHENTICATED, SOCKET_EVENT.CONNECT_ERROR, SOCKET_EVENT.DISCONNECT].sort(),
      );
      expect(Object.values(SOCKET_EVENT)).not.toContain("unauthorized");
      expect(Object.values(SOCKET_EVENT)).not.toContain("notification");
    });

    it("detach removes every listener and pending timer", async () => {
      await persistAccessToken("TOKEN");
      const { handlers, socket, lifecycle, emit } = track(setup());
      emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");

      lifecycle.detach();
      await jest.advanceTimersByTimeAsync(60_000);

      expect([...handlers.values()].every((set) => set.size === 0)).toBe(true);
      expect(socket.connect).not.toHaveBeenCalled();
    });
  });

  describe("rejected handshake", () => {
    beforeEach(async () => {
      await persistAccessToken("OLD");
      await persistRefreshToken("RT");
    });

    it('"Unauthorized!" refreshes once and reconnects once with the new token', async () => {
      const post = jest.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

      const { socket, emit, onAuthenticated } = track(setup());

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();

      expect(post).toHaveBeenCalledTimes(1);
      expect(await getAccessToken()).toBe("NEW");
      expect(socket.connect).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).toHaveBeenCalledWith(false);
    });

    it("an HMAC rejection spends no refresh and reconnects with backoff", async () => {
      const hmac = Object.assign(new Error("Unauthorized!"), { data: { errorType: "HMAC_ERROR" } });
      const post = jest.spyOn(axios, "post");

      const { socket, emit } = track(setup());

      for (let i = 0; i < MAX_REFRESH_ATTEMPTS + 1; i += 1) {
        emit(SOCKET_EVENT.CONNECT_ERROR, hmac);
        await flush();
        expect(socket.connect).toHaveBeenCalledTimes(i);
        await jest.advanceTimersByTimeAsync(RECONNECT_MAX_MS);
        expect(socket.connect).toHaveBeenCalledTimes(i + 1);
      }

      expect(post).not.toHaveBeenCalled();
      // the refresh budget is untouched: a token rejection still refreshes
      jest.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);
      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("does nothing extra while socket.io is auto-reconnecting", async () => {
      const post = jest.spyOn(axios, "post");

      const { socket, emit } = track(setup());
      socket.active = true;

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(post).not.toHaveBeenCalled();
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it("a refused refresh ends the session, clears SecureStore and never reconnects", async () => {
      jest.spyOn(axios, "post").mockRejectedValue(refreshFailure(401));
      const ended = jest.fn();
      unsubscribe.push(onSessionEnded(ended));
      const { socket, emit } = track(setup());

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(ended).toHaveBeenCalledWith("expired", "MAIN");
      expect(await getAccessToken()).toBeNull();
      expect(await getRefreshToken()).toBeNull();
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it("a refresh rejected for its signature keeps the session and backs off", async () => {
      jest.spyOn(axios, "post").mockRejectedValue(
        Object.assign(refreshFailure(401), {
          response: { status: 401, data: { errorType: "HMAC_ERROR" } },
        }),
      );
      const ended = jest.fn();
      unsubscribe.push(onSessionEnded(ended));
      const { socket, emit } = track(setup());

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();
      expect(socket.connect).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(RECONNECT_BASE_MS);

      expect(ended).not.toHaveBeenCalled();
      expect(await getAccessToken()).toBe("OLD");
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it("a transient refresh failure backs off and caps consecutive refreshes", async () => {
      const post = jest.spyOn(axios, "post").mockRejectedValue(refreshFailure());

      const { socket, emit } = track(setup());

      for (let outage = 0; outage < MAX_REFRESH_ATTEMPTS + 2; outage += 1) {
        emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
        await jest.advanceTimersByTimeAsync(30_000);
      }

      expect(post).toHaveBeenCalledTimes(MAX_REFRESH_ATTEMPTS);
      // every rejection was retried by the backoff timer, the last two without a refresh
      expect(socket.connect).toHaveBeenCalledTimes(MAX_REFRESH_ATTEMPTS + 2);
      expect(await getAccessToken()).toBe("OLD");
    });

    it("the refresh budget resets once the server authenticates", async () => {
      const post = jest.spyOn(axios, "post").mockRejectedValue(refreshFailure());

      const { emit } = track(setup());

      for (let i = 0; i < MAX_REFRESH_ATTEMPTS; i += 1) {
        emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
        await jest.advanceTimersByTimeAsync(30_000);
      }
      emit(SOCKET_EVENT.AUTHENTICATED);
      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();

      expect(post).toHaveBeenCalledTimes(MAX_REFRESH_ATTEMPTS + 1);
    });

    it("a rejection other than Unauthorized! only backs off", async () => {
      const post = jest.spyOn(axios, "post");

      const { socket, emit } = track(setup());

      emit(SOCKET_EVENT.CONNECT_ERROR, new Error("boom"));
      await jest.advanceTimersByTimeAsync(RECONNECT_BASE_MS);

      expect(post).not.toHaveBeenCalled();
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it("stop cancels a refresh still in flight", async () => {
      let resolve!: (value: never) => void;
      jest.spyOn(axios, "post").mockReturnValue(new Promise((r) => (resolve = r)));
      const { socket, lifecycle, emit } = track(setup());

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await flush();
      lifecycle.stop();
      resolve(NEW_TOKEN);
      await flush();

      expect(socket.connect).not.toHaveBeenCalled();
    });

    it("does not refresh or reconnect when signed out", async () => {
      resetSecureStore();
      const post = jest.spyOn(axios, "post");
      const { socket, emit } = track(setup());

      emit(SOCKET_EVENT.CONNECT_ERROR, rejected);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(post).not.toHaveBeenCalled();
      expect(socket.connect).not.toHaveBeenCalled();
    });
  });

  describe("server disconnect", () => {
    it("retries with backoff, doubling the delay", async () => {
      await persistAccessToken("TOKEN");
      const { socket, emit } = track(setup());

      emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");
      await jest.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
      expect(socket.connect).toHaveBeenCalledTimes(1);

      emit(SOCKET_EVENT.DISCONNECT, "io server disconnect");
      await jest.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
      expect(socket.connect).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
      expect(socket.connect).toHaveBeenCalledTimes(2);
    });
  });
});
