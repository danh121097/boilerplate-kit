import { logoutAndClear } from "@/__tests__/helpers/logout";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { endSession } from "@/services/core/session";
import { useAuthStore, watchSessionEnd } from "@/stores/auth";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };

// Signing out pins the session query to null; drop it so its GC timer does not
// keep jest alive.
afterAll(() => queryClient.clear());

describe("auth store explicit-logout flag", () => {
  afterEach(() => jest.restoreAllMocks());

  it("expireSession signs out without marking an explicit logout", () => {
    useAuthStore.setState({
      user: { _id: "u1" } as never,
      isAuthenticated: true,
      loggedOut: false,
    });
    useAuthStore.getState().expireSession();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      loggedOut: false,
    });
  });

  it("logout marks an explicit logout; setUser clears it", async () => {
    useAuthStore.setState({ user: { _id: "u1" } as never, isAuthenticated: true });
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await logoutAndClear();
    expect(useAuthStore.getState().loggedOut).toBe(true);

    useAuthStore.getState().setUser({ _id: "u1" } as never);
    expect(useAuthStore.getState().loggedOut).toBe(false);
  });
});

describe("auth store session-end subscription", () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    queryClient.clear();
    unsubscribe = watchSessionEnd();
    useAuthStore.setState({
      user: USER as never,
      isAuthenticated: true,
      hydrated: true,
    });
    queryClient.setQueryData(["users", "list"], [USER]);
  });
  afterEach(() => unsubscribe());

  it("an expiry of the auth service signs out and resets the cache", () => {
    endSession("expired", "MAIN");

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
    });
    expect(queryClient.getQueryData(["users", "list"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
  });

  it("refresh failure of another service keeps the main session", () => {
    endSession("expired", "ADMIN");

    expect(useAuthStore.getState()).toMatchObject({
      user: USER,
      isAuthenticated: true,
    });
    expect(queryClient.getQueryData(["users", "list"])).toEqual([USER]);
  });

  it("stops reacting once unsubscribed", () => {
    unsubscribe();
    endSession("expired", "MAIN");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
