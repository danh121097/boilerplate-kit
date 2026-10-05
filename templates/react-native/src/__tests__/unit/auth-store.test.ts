import { resetStorage } from "@/__tests__/helpers/fake-storage";
import { logoutAndClear } from "@/__tests__/helpers/logout";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { getAppStorage } from "@/services/core/app-storage";
import {
  clearServiceTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { onSessionEnded } from "@/services/core/session";
import { useAuthStore } from "@/stores/auth";

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
    hydrateError: null,
  });
}

describe("auth store", () => {
  beforeEach(() => {
    resetStorage();
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

    it("records a retryable hydrateError on a transient boot failure and clears it on retry", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValueOnce(REFRESH_UNAVAILABLE)
        .mockResolvedValueOnce(USER as never);

      await useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().hydrateError).toMatchObject({ retryable: true });
      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, hydrated: true });

      await useAuthStore.getState().retryHydrate();
      expect(useAuthStore.getState()).toMatchObject({
        user: USER,
        isAuthenticated: true,
        hydrateError: null,
      });
    });

    it("keeps the signed-in state and flags hydrateError when storage cannot be read", async () => {
      await persistAccessToken("AT", "MAIN");
      useAuthStore.setState({ user: USER as never, isAuthenticated: true, hydrated: true });
      const read = jest.spyOn(getAppStorage(), "getString").mockImplementation(() => {
        throw new Error("storage unreadable");
      });

      await useAuthStore.getState().retryHydrate();

      expect(useAuthStore.getState()).toMatchObject({ user: USER, isAuthenticated: true });
      expect(useAuthStore.getState().hydrateError).toMatchObject({ retryable: true });

      read.mockRestore();
      jest.spyOn(AuthModel, "getMe").mockResolvedValue(USER as never);
      await useAuthStore.getState().retryHydrate();
      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, hydrateError: null });
    });

    it("signs out locally only when the read succeeds with no tokens", async () => {
      useAuthStore.setState({ user: USER as never, isAuthenticated: true, hydrated: true });
      await useAuthStore.getState().retryHydrate();
      expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    });

    it("sets no hydrateError when the boot 401 ends the session", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });
      jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, hydrateError: null });
    });

    it("a boot 401 after the session already ended does not post logout", async () => {
      await persistAccessToken("AT", "MAIN");
      jest.spyOn(AuthModel, "getMe").mockImplementation(async () => {
        await clearServiceTokens("MAIN"); // what the refresh manager does on 401/403
        throw { status: "error", error_code: 401, message: "expired" };
      });
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, hydrated: true });
      expect(post).not.toHaveBeenCalled();
    });

    it("a boot 401 with a live session revokes it and ends it as expired with a return path", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      jest
        .spyOn(AuthModel, "getMe")
        .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
      const ended = jest.fn();
      const unsubscribe = onSessionEnded(ended);

      try {
        await useAuthStore.getState().hydrate();
      } finally {
        unsubscribe();
      }

      expect(post).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith("expired", "MAIN");
      // Not an explicit logout, so the (app) gate adds a redirect.
      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: false,
        hydrated: true,
        loggedOut: false,
      });
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

  describe("logout", () => {
    it("revokes with the refresh token, clears tokens, state and the query cache", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      useAuthStore.setState({ user: USER as never, isAuthenticated: true, hydrated: true });
      queryClient.setQueryData(["users", "list"], [USER]);
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await logoutAndClear();

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

      await logoutAndClear();

      expect(queryClient.getQueryData(["users", "list"])).toBeUndefined();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(await getAccessToken("MAIN")).toBeNull();
    });
  });
});
