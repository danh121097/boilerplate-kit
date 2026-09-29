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

describe("auth store session expiry flag", () => {
  afterEach(() => jest.restoreAllMocks());

  it("expireSession marks an involuntary sign-out; login and logout reset it", async () => {
    useAuthStore.setState({ user: { _id: "u1" } as never, isAuthenticated: true });
    useAuthStore.getState().expireSession();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      sessionExpired: true,
    });

    useAuthStore.getState().setUser({ _id: "u1" } as never);
    expect(useAuthStore.getState().sessionExpired).toBe(false);

    useAuthStore.getState().expireSession();
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().sessionExpired).toBe(false);
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
      sessionExpired: false,
    });
    queryClient.setQueryData(["users", "list"], [USER]);
  });
  afterEach(() => unsubscribe());

  it("an expiry of the auth service signs out, flags the expiry and resets the cache", () => {
    endSession("expired", "MAIN");

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      sessionExpired: true,
    });
    expect(queryClient.getQueryData(["users", "list"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
  });

  it("refresh failure of another service keeps the main session", () => {
    endSession("expired", "ADMIN");

    expect(useAuthStore.getState()).toMatchObject({
      user: USER,
      isAuthenticated: true,
      sessionExpired: false,
    });
    expect(queryClient.getQueryData(["users", "list"])).toEqual([USER]);
  });

  it("stops reacting once unsubscribed", () => {
    unsubscribe();
    endSession("expired", "MAIN");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
