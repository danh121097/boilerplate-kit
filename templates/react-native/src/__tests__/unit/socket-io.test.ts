import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { useSocketIOStore } from "@/stores/socket-io";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);
// socket.io-client is heavy + native-adjacent; the store tests never open a real
// connection, so stub it out.
jest.mock("socket.io-client", () => ({ io: jest.fn(() => ({})) }));

describe("socket-io store", () => {
  beforeEach(() => {
    resetSecureStore();
    useSocketIOStore.setState({ socket: null, authenticated: false });
  });

  it("setSocketIO partial-merges authenticated + socket", () => {
    const fakeSocket = {} as never;
    useSocketIOStore.getState().setSocketIO({ authenticated: true, socket: fakeSocket });
    expect(useSocketIOStore.getState().authenticated).toBe(true);
    expect(useSocketIOStore.getState().socket).toBe(fakeSocket);

    // partial update keeps the socket
    useSocketIOStore.getState().setSocketIO({ authenticated: false });
    expect(useSocketIOStore.getState().authenticated).toBe(false);
    expect(useSocketIOStore.getState().socket).toBe(fakeSocket);
  });
});
