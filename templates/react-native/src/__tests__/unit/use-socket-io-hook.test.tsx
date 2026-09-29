import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { persistAccessToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const mockSocket = {
  auth: {} as unknown,
  connected: false,
  on: jest.fn(),
  off: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock("socket.io-client", () => ({ io: jest.fn(() => mockSocket) }));

import { useSocketIO } from "@/hooks/useSocketIO";

describe("useSocketIO connect guard", () => {
  beforeEach(async () => {
    resetSecureStore();
    await persistAccessToken("TKN", "MAIN");
    useSocketIOStore.setState({ socket: null, authenticated: false });
    mockSocket.connect.mockClear();
    mockSocket.disconnect.mockClear();
  });

  it("connects once after mount", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    await act(async () => {});
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not connect when unmounted during the pending auth read", async () => {
    const { unmount } = renderHook(() => useSocketIO());
    unmount(); // the SecureStore read has not resolved yet
    await act(async () => {});
    expect(mockSocket.connect).not.toHaveBeenCalled();
    expect(useSocketIOStore.getState().socket).toBeNull();
  });
});
