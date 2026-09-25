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
import { RefreshRejectedError, RefreshUnavailableError } from "@/services/core/refresh-errors";
import { useAuthStore } from "@/stores/auth";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };

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
      ["offline", new RefreshUnavailableError(0, "ERR_NETWORK")],
      ["a 5xx", { status: "error", error_code: 500, message: "boom" }],
      ["a rate limit", new RefreshUnavailableError(429, "ERR_BAD_REQUEST")],
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

    it("logs out when the refresh was rejected and tokens were cleared", async () => {
      await persistAccessToken("AT", "MAIN");
      jest.spyOn(AuthModel, "getMe").mockImplementation(async () => {
        await clearServiceTokens("MAIN"); // what the refresh manager does on 401/403
        throw new RefreshRejectedError(401);
      });

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, hydrated: true });
    });

    it("logs out on a 401 even if a token is somehow still stored", async () => {
      await persistAccessToken("AT", "MAIN");
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe("loadUser", () => {
    it("recovers the user on retry after a transient boot failure", async () => {
      await persistAccessToken("AT", "MAIN");
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValueOnce(new RefreshUnavailableError(0, "ERR_NETWORK"))
        .mockResolvedValueOnce(USER as never);

      await useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().user).toBeNull();

      await useAuthStore.getState().loadUser();
      expect(useAuthStore.getState()).toMatchObject({ user: USER, isAuthenticated: true });
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
      me.reject(new RefreshUnavailableError(0, "ERR_NETWORK"));
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
