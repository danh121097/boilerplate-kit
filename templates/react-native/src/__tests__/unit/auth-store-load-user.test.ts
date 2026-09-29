import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import {
  getAccessToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { endSession } from "@/services/core/session";
import { useAuthStore } from "@/stores/auth";

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
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    hydrated: false,
    loggedOut: false,
  });
}

describe("auth store loadUser", () => {
  beforeEach(() => {
    resetSecureStore();
    resetStore();
    queryClient.clear();
  });
  afterEach(() => jest.restoreAllMocks());

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

    it("a mid-session 401 on the profile retry revokes the session as expired", async () => {
      await persistAccessToken("AT", "MAIN");
      useAuthStore.setState({ isAuthenticated: true, hydrated: true });
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await useAuthStore.getState().loadUser();

      expect(post).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState()).toMatchObject({
        user: null,
        isAuthenticated: false,
        loggedOut: false,
      });
      expect(await getAccessToken("MAIN")).toBeNull();
    });

    it("overlapping calls hitting the same 401 share one getMe and post logout once", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      const getMe = jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await Promise.all([useAuthStore.getState().loadUser(), useAuthStore.getState().loadUser()]);

      expect(getMe).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledTimes(1);
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
});
