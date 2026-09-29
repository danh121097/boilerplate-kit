import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { persistAccessToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

type Handler = (...args: unknown[]) => void;
const mockHandlers = new Map<string, Handler>();
const mockSocket = {
  auth: {} as unknown,
  connected: false,
  active: false,
  on: jest.fn((event: string, handler: Handler) => {
    mockHandlers.set(event, handler);
  }),
  off: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock("socket.io-client", () => ({ io: jest.fn(() => mockSocket) }));

import { useSocketIO } from "@/hooks/useSocketIO";

const emit = (event: string, ...args: unknown[]) => {
  act(() => {
    mockHandlers.get(event)?.(...args);
  });
};
const rejectHandshake = () => emit("connect_error", new Error("Unauthorized!"));
/** Advance the fake clock and let the auth read that follows a retry settle. */
const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

describe("useSocketIO", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    mockHandlers.clear();
    resetSecureStore();
    await persistAccessToken("TKN", "MAIN");
    useSocketIOStore.setState({ socket: null, authenticated: false });
    mockSocket.active = false;
    mockSocket.auth = {};
    mockSocket.connect.mockClear();
    mockSocket.disconnect.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("connects once after mount", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not connect when unmounted during the pending auth read", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    unmount(); // the SecureStore read has not resolved yet
    await advance(0);
    expect(mockSocket.connect).not.toHaveBeenCalled();
    expect(useSocketIOStore.getState().socket).toBeNull();
  });

  it("becomes authenticated only on the server event and drops it on disconnect", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);
    expect(useSocketIOStore.getState().authenticated).toBe(false);

    emit("authenticated");
    expect(useSocketIOStore.getState().authenticated).toBe(true);

    emit("disconnect", "transport close");
    expect(useSocketIOStore.getState().authenticated).toBe(false);
    unmount();
  });

  it("retries a rejected handshake at 2s then 4s on the same socket with fresh auth", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);

    rejectHandshake();
    rejectHandshake(); // a pending retry is not rescheduled
    expect(useSocketIOStore.getState().authenticated).toBe(false);
    await persistAccessToken("TKN2", "MAIN"); // rotated while waiting
    await advance(1999);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
    expect(mockSocket.auth).toEqual(expect.objectContaining({ token: "Bearer TKN2" }));

    rejectHandshake();
    await advance(3999);
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("retries after the server closes the socket, but not after a client disconnect", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);
    emit("authenticated");

    emit("disconnect", "io client disconnect");
    await advance(60_000);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);

    emit("disconnect", "io server disconnect");
    expect(useSocketIOStore.getState().authenticated).toBe(false);
    await advance(2000);
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("schedules no manual retry while socket.io is reconnecting by itself", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);

    mockSocket.active = true;
    rejectHandshake();
    await advance(60_000);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("resets the backoff once authenticated", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);

    rejectHandshake();
    await advance(2000); // first retry
    rejectHandshake();
    await advance(4000); // second retry
    expect(mockSocket.connect).toHaveBeenCalledTimes(3);

    emit("authenticated");
    rejectHandshake();
    await advance(2000); // back to the base delay
    expect(mockSocket.connect).toHaveBeenCalledTimes(4);
    unmount();
  });

  it("caps the retry delay at 30s", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);

    for (const delay of [2000, 4000, 8000, 16_000]) {
      rejectHandshake();
      await advance(delay);
    }
    rejectHandshake();
    await advance(29_999);
    expect(mockSocket.connect).toHaveBeenCalledTimes(5);
    await advance(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(6);
    unmount();
  });

  it("cancels a pending retry on unmount", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await advance(0);

    rejectHandshake();
    unmount();
    await advance(60_000);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });
});
