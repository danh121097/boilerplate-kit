import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { AuthModel } from "@/services/auth";
import {
  endSession,
  getSessionEpoch,
  onSessionEnded,
  RefreshTokenManager,
  SESSION_WAIT_TIMEOUT_MS,
} from "@/services/core";
import {
  clearServiceTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

/**
 * AuthModel is tested against a stubbed `api` (the response interceptor already
 * unwraps the backend envelope, so the stub resolves to the envelope body and the
 * model reads `.data` once). Verifies token lifecycle + payload mapping against
 * async SecureStore.
 */

const RESULT = {
  user: { _id: "u1", email: "a@b.com", name: "A", role: "user" },
  tokens: { accessToken: "AT", refreshToken: "RT" },
};

describe("AuthModel", () => {
  beforeEach(() => resetSecureStore());
  afterEach(() => jest.restoreAllMocks());

  it("login persists the access token and returns the result", async () => {
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(res).toEqual(RESULT);
    expect(await getAccessToken("MAIN")).toBe("AT");
  });

  it("login persists the refresh token when the server returns one", async () => {
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(await getRefreshToken("MAIN")).toBe("RT");
  });

  it("login does not persist refresh token when server omits it", async () => {
    const resultNoRefresh = { ...RESULT, tokens: { accessToken: "AT" } };
    jest
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true, data: resultNoRefresh } as never);
    await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(await getRefreshToken("MAIN")).toBeNull();
  });

  it("register persists the access token and returns the result", async () => {
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.register({ email: "a@b.com", password: "x", name: "A" });
    expect(res.user._id).toBe("u1");
    expect(await getAccessToken("MAIN")).toBe("AT");
  });

  it("logout clears the stored token", async () => {
    await persistAccessToken("AT", "MAIN");
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(await getAccessToken("MAIN")).toBeNull();
  });

  it("logout sends the stored refresh token in the body so the server can revoke it", async () => {
    await persistAccessToken("AT", "MAIN");
    await persistRefreshToken("RT", "MAIN");
    const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/auth/logout", data: { refreshToken: "RT" } }),
    );
    expect(await getRefreshToken("MAIN")).toBeNull();
  });

  it("logout sends the captured access token as an explicit Bearer header", async () => {
    await persistAccessToken("AT", "MAIN");
    await persistRefreshToken("RT", "MAIN");
    const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(post).toHaveBeenCalledWith({
      url: "/auth/logout",
      data: { refreshToken: "RT" },
      headers: { authorization: "Bearer AT" },
    });
  });

  describe("revokeSession", () => {
    let ended: jest.Mock;
    let unsubscribe: () => void;

    beforeEach(() => {
      ended = jest.fn();
      unsubscribe = onSessionEnded(ended);
    });
    afterEach(() => unsubscribe());

    it("revokes the stored refresh token, clears the tokens and ends the session as expired", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await expect(AuthModel.revokeSession()).resolves.toBe(true);

      expect(post).toHaveBeenCalledWith({
        url: "/auth/logout",
        data: { refreshToken: "RT" },
        headers: { authorization: "Bearer AT" },
      });
      expect(await getAccessToken("MAIN")).toBeNull();
      expect(await getRefreshToken("MAIN")).toBeNull();
      expect(ended).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    });

    it("concurrent revokes post logout once", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const results = await Promise.all([AuthModel.revokeSession(), AuthModel.revokeSession()]);

      expect(results).toEqual([true, true]);
      expect(post).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledTimes(1);
    });

    it("is best effort: a failed request still clears the tokens and ends the session", async () => {
      await persistAccessToken("AT", "MAIN");
      jest.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));

      await expect(AuthModel.revokeSession()).resolves.toBe(true);

      expect(await getAccessToken("MAIN")).toBeNull();
      expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    });

    it("does nothing when the session ended since the given epoch", async () => {
      await persistAccessToken("AT", "MAIN");
      const epoch = getSessionEpoch("MAIN");
      endSession("logout", "MAIN"); // e.g. a logout that finished while getMe was in flight
      ended.mockClear();
      await persistAccessToken("NEXT", "MAIN"); // and a new sign-in
      const post = jest.spyOn(AuthModel.api, "post");

      await expect(AuthModel.revokeSession(epoch)).resolves.toBe(false);

      expect(post).not.toHaveBeenCalled();
      expect(ended).not.toHaveBeenCalled();
      expect(await getAccessToken("MAIN")).toBe("NEXT");
    });

    it("revokes when the session is still the one of the given epoch", async () => {
      await persistAccessToken("AT", "MAIN");
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      await expect(AuthModel.revokeSession(getSessionEpoch("MAIN"))).resolves.toBe(true);

      expect(post).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    });

    it("a logout during an in-flight revoke posts once and ends the session once", async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      const pending: (() => void)[] = [];
      const post = jest
        .spyOn(AuthModel.api, "post")
        .mockImplementation(() => new Promise((r) => pending.push(() => r({} as never))));

      const revoking = AuthModel.revokeSession();
      await new Promise((r) => setTimeout(r, 0)); // the revoke request is in flight
      const loggingOut = AuthModel.logout();
      pending.forEach((release) => release());
      await revoking;
      await new Promise((r) => setTimeout(r, 0)); // a second request, if any, is sent now
      pending.forEach((release) => release());
      await loggingOut;

      expect(post).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(await getRefreshToken("MAIN")).toBeNull();
    });

    it("does nothing when no session is stored", async () => {
      const post = jest.spyOn(AuthModel.api, "post");

      await expect(AuthModel.revokeSession()).resolves.toBe(false);

      expect(post).not.toHaveBeenCalled();
      expect(ended).not.toHaveBeenCalled();
    });

    it("does nothing while a logout is pending", async () => {
      await persistAccessToken("AT", "MAIN");
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const loggingOut = AuthModel.logout();
      const revoked = await AuthModel.revokeSession();
      await loggingOut;

      expect(revoked).toBe(false);
      expect(post).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    });
  });

  it("a voluntary logout ends as logout without a return path", async () => {
    await persistAccessToken("AT", "MAIN");
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = jest.fn();
    const unsubscribe = onSessionEnded(ended);
    try {
      await AuthModel.logout();
    } finally {
      unsubscribe();
    }
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
  });

  it("logout sends no Authorization header when no access token was held", async () => {
    await persistRefreshToken("RT", "MAIN");
    const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(post.mock.calls[0]?.[0]).not.toHaveProperty("headers");
  });

  it("logout stops waiting for a hung refresh after the cap and revokes the current token", async () => {
    jest.useFakeTimers();
    let release: (error: Error) => void = () => {};
    try {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      const hung = new RefreshTokenManager({
        service: "MAIN",
        // Does not settle until the test releases it.
        refresh: () => new Promise((_resolve, reject) => (release = reject)),
        onRefreshFailed: jest.fn(),
      });
      const pending = hung.getFreshToken().catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0); // the refresh call is now in flight
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const loggingOut = AuthModel.logout();
      await jest.advanceTimersByTimeAsync(SESSION_WAIT_TIMEOUT_MS - 1);
      expect(post).not.toHaveBeenCalled(); // still waiting just under the cap
      await jest.advanceTimersByTimeAsync(1);
      await loggingOut;

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { refreshToken: "RT" },
          headers: { authorization: "Bearer AT" },
        }),
      );
      expect(await getAccessToken("MAIN")).toBeNull();
      expect(await getRefreshToken("MAIN")).toBeNull();
      release(new Error("released"));
      await pending; // leave no pending refresh behind for later tests
    } finally {
      jest.useRealTimers();
    }
  });

  describe("logout while a refresh is in flight", () => {
    let release: (error?: Error) => void = () => {};
    let pending: Promise<unknown>;

    beforeEach(async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      const inFlight = new RefreshTokenManager({
        service: "MAIN",
        refresh: () =>
          new Promise((_resolve, reject) => (release = (e = new Error("released")) => reject(e))),
        onRefreshFailed: jest.fn(),
      });
      pending = inFlight.getFreshToken().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 0)); // the refresh call is now in flight
    });

    it("revokes the pair stored when the refresh settles (the rotated one)", async () => {
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const loggingOut = AuthModel.logout();
      await persistAccessToken("AT2", "MAIN");
      await persistRefreshToken("RT2", "MAIN");
      release();
      await loggingOut;
      await pending;

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { refreshToken: "RT2" },
          headers: { authorization: "Bearer AT2" },
        }),
      );
    });

    it("falls back to the pair held when logout started if storage was emptied meanwhile", async () => {
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const loggingOut = AuthModel.logout();
      await clearServiceTokens("MAIN");
      release();
      await loggingOut;
      await pending;

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { refreshToken: "RT" },
          headers: { authorization: "Bearer AT" },
        }),
      );
      expect(await getRefreshToken("MAIN")).toBeNull();
    });
  });

  it("logout still clears the token even if the request fails", async () => {
    await persistAccessToken("AT", "MAIN");
    jest.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));
    await expect(AuthModel.logout()).rejects.toThrow("network");
    expect(await getAccessToken("MAIN")).toBeNull();
  });

  it("getMe returns the unwrapped user", async () => {
    jest
      .spyOn(AuthModel.api, "get")
      .mockResolvedValue({ success: true, data: { user: RESULT.user } } as never);
    const user = await AuthModel.getMe();
    expect(user).toEqual(RESULT.user);
  });

  it("getSession resolves null when the session is rejected (401)", async () => {
    jest
      .spyOn(AuthModel.api, "get")
      .mockRejectedValue({ status: "error", error_code: 401, message: "expired" });
    await expect(AuthModel.getSession()).resolves.toBeNull();
  });

  it("getSession rejects on a transient failure", async () => {
    const offline = { status: "error", error_code: 0, message: "offline", retryable: true };
    jest.spyOn(AuthModel.api, "get").mockRejectedValue(offline);
    await expect(AuthModel.getSession()).rejects.toBe(offline);
  });
});
