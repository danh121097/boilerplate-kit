import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { AuthModel } from "@/services/auth";
import { onSessionEnded, RefreshTokenManager, SESSION_WAIT_TIMEOUT_MS } from "@/services/core";
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

  it("getSession resolves null when the user is gone (404)", async () => {
    jest
      .spyOn(AuthModel.api, "get")
      .mockRejectedValue({ status: "error", error_code: 404, message: "User not found!" });
    await expect(AuthModel.getSession()).resolves.toBeNull();
  });

  it("getSession rejects on a transient failure", async () => {
    const offline = { status: "error", error_code: 0, message: "offline", retryable: true };
    jest.spyOn(AuthModel.api, "get").mockRejectedValue(offline);
    await expect(AuthModel.getSession()).rejects.toBe(offline);
  });
});
