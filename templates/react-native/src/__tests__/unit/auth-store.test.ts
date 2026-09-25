import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import {
  clearServiceTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { endSession } from "@/services/core/session";
import { useAuthStore, watchSessionEnd } from "@/stores/auth";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };

// Signing out pins the session query to null; drop it so its GC timer does not
// keep jest alive.
afterAll(() => queryClient.clear());

/** What the interceptors reject with when a refresh fails transiently. */
const REFRESH_UNAVAILABLE = {
  status: "error",
  error_code: 0,
  message: "refresh_unavailable",
  error_message: "refresh_unavailable",
  retryable: true,
};

function resetStore() {
  useAuthStore.setState({ user: null, isAuthenticated: false, hydrated: false });
}

describe("auth store", () => {
  beforeEach(() => {
    resetSecureStore();
    resetStore();
    queryClient.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  describe("hydrate", () => {
    it("stays logged out without a stored token", async () => {
      const getMe = jest.spyOn(AuthModel, "getMe");
      await useAuthStore.getState().hydrate();
      expect(getMe).not.toHaveBeenCalled();
      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, hydrated: true });
    });

    it("restores the session and user when getMe succeeds", async () => {
      await persistAccessToken("AT", "MAIN");
      jest.spyOn(AuthModel, "getMe").mockResolvedValue(USER as never);
      await useAuthStore.getState().hydrate();
      expect(useAuthStore.getState()).toMatchObject({
        user: USER,
        isAuthenticated: true,
        hydrated: true,
      });
    });

    it.each([
      ["offline", REFRESH_UNAVAILABLE],
      ["a 5xx", { status: "error", error_code: 500, message: "boom" }],
      ["a rate limit", { ...REFRESH_UNAVAILABLE, error_code: 429 }],
    ])("stays authenticated (user unknown) when boot getMe fails with %s", async (_l, err) => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      jest.spyOn(AuthModel, "getMe").mockRejectedValue(err);

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState()).toMatchObject({
        user: null,
        isAuthenticated: true,
        hydrated: true,
      });
      expect(await getAccessToken("MAIN")).toBe("AT");
      expect(await getRefreshToken("MAIN")).toBe("RT");
    });

    it("logs out when the refresh was refused and tokens were cleared", async () => {
      await persistAccessToken("AT", "MAIN");
      jest.spyOn(AuthModel, "getMe").mockImplementation(async () => {
        await clearServiceTokens("MAIN"); // what the refresh manager does on 401/403
        throw { status: "error", error_code: 401, message: "expired" };
      });
      jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, hydrated: true });
    });

    it("ends the session (revokes and clears the tokens) on a 401 with tokens still stored", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, hydrated: true });
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ data: { refreshToken: "RT" } }));
      expect(await getAccessToken("MAIN")).toBeNull();
      expect(await getRefreshToken("MAIN")).toBeNull();
    });

    it("restores the session from a refresh token alone", async () => {
      await persistRefreshToken("RT", "MAIN");
      jest.spyOn(AuthModel, "getMe").mockResolvedValue(USER as never);
      await useAuthStore.getState().hydrate();
      expect(useAuthStore.getState()).toMatchObject({ user: USER, isAuthenticated: true });
    });
  });

  describe("loadUser", () => {
    it("recovers the user on retry after a transient boot failure", async () => {
      await persistAccessToken("AT", "MAIN");
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValueOnce(REFRESH_UNAVAILABLE)
        .mockResolvedValueOnce(USER as never);

      await useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().user).toBeNull();

      await useAuthStore.getState().loadUser();
      expect(useAuthStore.getState()).toMatchObject({ user: USER, isAuthenticated: true });
    });

    it("overlapping calls hitting the same 401 share one getMe and run a single logout", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      const getMe = jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });
      const logout = jest.spyOn(AuthModel, "logout");
      jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await Promise.all([useAuthStore.getState().loadUser(), useAuthStore.getState().loadUser()]);

      expect(getMe).toHaveBeenCalledTimes(1);
      expect(logout).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    });

    it("a call made after the session ended does not join the old session's getMe", async () => {
      await persistAccessToken("AT", "MAIN");
      let resolveFirst: (user: never) => void = () => {};
      const getMe = jest
        .spyOn(AuthModel, "getMe")
        .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
        .mockResolvedValueOnce(USER as never);

      const first = useAuthStore.getState().loadUser();
      endSession("logout", "MAIN");
      const second = useAuthStore.getState().loadUser();
      resolveFirst(USER as never);
      await Promise.all([first, second]);

      expect(getMe).toHaveBeenCalledTimes(2);
    });
  });

  describe("loadUser racing logout", () => {
    function deferred<T>() {
      let resolve: (v: T) => void = () => {};
      let reject: (e: unknown) => void = () => {};

      const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
      return { promise, resolve, reject };
    }

    beforeEach(async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      useAuthStore.setState({ user: null, isAuthenticated: true, hydrated: true });
      jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    });

    it("ignores a getMe success that lands after logout", async () => {
      const me = deferred<never>();
      jest.spyOn(AuthModel, "getMe").mockReturnValue(me.promise);

      const loading = useAuthStore.getState().loadUser();
      await useAuthStore.getState().logout();
      me.resolve(USER as never);
      await loading;

      expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
      expect(await getAccessToken("MAIN")).toBeNull();
    });

    it("ignores a getMe failure that lands after logout", async () => {
      const me = deferred<never>();
      jest.spyOn(AuthModel, "getMe").mockReturnValue(me.promise);

      const loading = useAuthStore.getState().loadUser();
      await useAuthStore.getState().logout();
      me.reject(REFRESH_UNAVAILABLE);
      await loading;

      expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    });
  });

  describe("logout", () => {
    it("revokes with the refresh token, clears tokens, state and the query cache", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      useAuthStore.setState({ user: USER as never, isAuthenticated: true, hydrated: true });
      queryClient.setQueryData(["users", "list"], [USER]);
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await useAuthStore.getState().logout();

      expect(post).toHaveBeenCalledWith(expect.objectContaining({ data: { refreshToken: "RT" } }));
      expect(queryClient.getQueryData(["users", "list"])).toBeUndefined();
      expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
      expect(await getAccessToken("MAIN")).toBeNull();
      expect(await getRefreshToken("MAIN")).toBeNull();
    });

    it("still clears everything when the logout request fails", async () => {
      await persistAccessToken("AT", "MAIN");
      useAuthStore.setState({ user: USER as never, isAuthenticated: true, hydrated: true });
      queryClient.setQueryData(["users", "list"], [USER]);
      jest.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("offline"));

      await useAuthStore.getState().logout();

      expect(queryClient.getQueryData(["users", "list"])).toBeUndefined();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(await getAccessToken("MAIN")).toBeNull();
    });
  });
});

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
