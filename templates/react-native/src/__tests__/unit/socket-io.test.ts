import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { buildSocketAuth } from "@/hooks/useSocketIO";
import { persistAccessToken } from "@/services/core/auth-token-storage";
import { useSocketIOStore } from "@/stores/socket-io";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);
// socket.io-client is heavy + native-adjacent; the store/auth-builder tests never
// open a real connection, so stub it out.
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

describe("buildSocketAuth", () => {
  let secretSnapshot: string | undefined;
  beforeEach(() => {
    resetSecureStore();
    secretSnapshot = process.env.EXPO_PUBLIC_HMAC_SECRET;
  });
  afterEach(() => {
    if (secretSnapshot === undefined) delete process.env.EXPO_PUBLIC_HMAC_SECRET;
    else process.env.EXPO_PUBLIC_HMAC_SECRET = secretSnapshot;
  });

  it("attaches the stored access token as a Bearer handshake token (async read)", async () => {
    await persistAccessToken("TKN", "MAIN");
    delete process.env.EXPO_PUBLIC_HMAC_SECRET;
    const auth = await buildSocketAuth();
    expect(auth.token).toBe("Bearer TKN");
    expect(auth.role).toBe("user");
    expect(auth).not.toHaveProperty("sig"); // no HMAC without a secret
  });

  it("adds HMAC sig/ctime when a secret is configured", async () => {
    await persistAccessToken("TKN", "MAIN");
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const auth = await buildSocketAuth();
    expect(auth).toHaveProperty("sig");
    expect(auth).toHaveProperty("ctime");
  });

  it("falls back to an empty Bearer when no token is stored", async () => {
    const auth = await buildSocketAuth();
    expect(auth.token).toBe("Bearer ");
  });
});
