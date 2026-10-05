import { resetStorage } from "@/__tests__/helpers/fake-storage";
import { refreshFailure } from "@/__tests__/helpers/http-mocks";
import { AuthModel } from "@/services/auth";
import {
  bumpSessionEpoch,
  endSession,
  getSessionEpoch,
  onSessionEnded,
  RefreshTokenManager,
} from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";

/**
 * `AuthModel.revokeSession()`: the server rejected the session, so it is revoked
 * like a logout but ends as "expired" — once for concurrent callers, and not at
 * all when the session already ended. `api` is stubbed as in auth-service.test.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("AuthModel.revokeSession", () => {
  let ended: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(() => {
    resetStorage();
    ended = jest.fn();
    unsubscribe = onSessionEnded(ended);
  });
  afterEach(() => {
    unsubscribe();
    jest.restoreAllMocks();
  });

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

  describe("while a refresh holds the lock", () => {
    let settleRefresh: (error: Error) => void = () => {};
    let pendingRefresh: Promise<unknown>;

    /** Start a refresh that settles only when the test says so. */
    async function refreshInFlight() {
      const manager = new RefreshTokenManager({
        service: "MAIN",
        refresh: () => new Promise((_resolve, reject) => (settleRefresh = reject)),
        onRefreshFailed: () => endSession("expired", "MAIN"),
      });
      pendingRefresh = manager.getFreshToken().catch(() => undefined);
      await flush(); // the refresh call is now in flight
    }

    beforeEach(async () => {
      await persistAccessToken("AT", "MAIN");
      await persistRefreshToken("RT", "MAIN");
      await refreshInFlight();
    });

    it("a revoke waiting for the lock does nothing when a refused refresh ends the session first", async () => {
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const revoking = AuthModel.revokeSession(getSessionEpoch("MAIN"));
      await flush(); // the revoke is waiting for the refresh
      settleRefresh(refreshFailure("ERR_BAD_REQUEST", 401));
      await pendingRefresh;

      await expect(revoking).resolves.toBe(false);
      expect(post).not.toHaveBeenCalled();
      expect(ended).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    });

    it("a logout joining a revoke that backs out still signs out", async () => {
      const post = jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const revoking = AuthModel.revokeSession(getSessionEpoch("MAIN"));
      const loggingOut = AuthModel.logout(); // joins the revoke in flight
      bumpSessionEpoch("MAIN"); // the revoked session is gone before the revoke runs
      settleRefresh(new Error("offline")); // a transient failure: the tokens stay
      await pendingRefresh;

      await expect(revoking).resolves.toBe(false);
      await loggingOut;
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ data: { refreshToken: "RT" } }));
      expect(ended).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith("logout", "MAIN");
      expect(await getAccessToken("MAIN")).toBeNull();
      expect(await getRefreshToken("MAIN")).toBeNull();
    });
  });
});
