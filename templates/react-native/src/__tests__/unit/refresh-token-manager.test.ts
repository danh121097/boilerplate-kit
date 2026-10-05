import { resetStorage } from "@/__tests__/helpers/fake-storage";
import { refreshFailure } from "@/__tests__/helpers/http-mocks";
import { SessionEndedError } from "@/services/core/api-errors";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { beginLogout } from "@/services/core/session";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("RefreshTokenManager", () => {
  beforeEach(() => resetStorage());

  it("dedupes concurrent calls into a single refresh and persists the tokens", async () => {
    let runs = 0;

    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        runs += 1;
        await tick();
        return { accessToken: `T${runs}`, refreshToken: `R${runs}` };
      },
      onRefreshFailed: () => {},
    });

    const [a, b, c] = await Promise.all([
      mgr.getFreshToken(),
      mgr.getFreshToken(),
      mgr.getFreshToken(),
    ]);

    expect(runs).toBe(1); // single-flight
    expect([a, b, c]).toEqual(["T1", "T1", "T1"]);
    expect(await getAccessToken("MAIN")).toBe("T1"); // persisted
    expect(await getRefreshToken("MAIN")).toBe("R1"); // rotated refresh persisted
  });

  it("refreshes again after the in-flight one settles", async () => {
    let runs = 0;

    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: `T${++runs}` }),
      onRefreshFailed: () => {},
    });

    expect(await mgr.getFreshToken()).toBe("T1");
    expect(await mgr.getFreshToken()).toBe("T2");
    expect(runs).toBe(2);
  });

  it.each([401, 403])(
    "clears the tokens and fires onRefreshFailed when the server refuses the refresh (%s)",
    async (status) => {
      await persistAccessToken("OLD", "MAIN");
      await persistRefreshToken("OLD_R", "MAIN");
      const onRefreshFailed = jest.fn();
      const refused = refreshFailure("ERR_BAD_REQUEST", status);
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: async () => {
          throw refused;
        },
        onRefreshFailed,
      });

      await expect(mgr.getFreshToken()).rejects.toBe(refused);
      expect(onRefreshFailed).toHaveBeenCalledTimes(1);
      expect(await getAccessToken("MAIN")).toBeNull(); // cleared
      expect(await getRefreshToken("MAIN")).toBeNull();
    },
  );

  it("fires onRefreshed once the rotated tokens are persisted", async () => {
    const onRefreshed = jest.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: "T" }),
      onRefreshed,
      onRefreshFailed: () => {},
    });

    await mgr.getFreshToken();

    expect(onRefreshed).toHaveBeenCalledTimes(1);
    expect(await getAccessToken("MAIN")).toBe("T");
  });

  it("returns the stored token without refreshing when it differs from the stale one", async () => {
    await persistAccessToken("ROTATED", "MAIN");
    const refresh = jest.fn();
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });

    expect(await mgr.getFreshToken("OLD")).toBe("ROTATED");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects with session_ended and makes no refresh call while a logout is pending", async () => {
    await persistAccessToken("OLD", "MAIN");
    const refresh = jest.fn();
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });
    const done = beginLogout("MAIN");
    try {
      await expect(mgr.getFreshToken()).rejects.toBeInstanceOf(SessionEndedError);
    } finally {
      done();
    }
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects with session_ended when the session is no longer alive", async () => {
    const refresh = jest.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh,
      onRefreshFailed: () => {},
      isSessionAlive: async () => false,
    });

    await expect(mgr.getFreshToken()).rejects.toBeInstanceOf(SessionEndedError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["offline", refreshFailure("ERR_NETWORK")],
    ["rate-limited", refreshFailure("ERR_BAD_REQUEST", 429)],
    ["server error", refreshFailure("ERR_BAD_RESPONSE", 503)],
    ["a bad request", refreshFailure("ERR_BAD_REQUEST", 400)],
    ["a malformed response", new Error("refresh_response_missing_access_token")],
  ])("keeps the tokens and does not expire the session when %s", async (_label, failure) => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    const onRefreshFailed = jest.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw failure;
      },
      onRefreshFailed,
    });

    await expect(mgr.getFreshToken()).rejects.toBe(failure);
    expect(onRefreshFailed).not.toHaveBeenCalled();
    expect(await getAccessToken("MAIN")).toBe("OLD");
    expect(await getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it("does not re-save tokens when the session is cleared while the refresh is in flight", async () => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));

    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        await gate;
        return { accessToken: "NEW", refreshToken: "NEW_R" };
      },
      onRefreshFailed: () => {},
    });

    const pending = mgr.getFreshToken();
    await clearAuthTokens(); // logout lands mid-refresh
    release();

    await expect(pending).rejects.toBeInstanceOf(SessionEndedError);
    expect(await getAccessToken("MAIN")).toBeNull();
    expect(await getRefreshToken("MAIN")).toBeNull();
  });

  it("does not wipe a newer session when a stale refresh is rejected after logout + re-login", async () => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const onRefreshFailed = jest.fn();

    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        await gate;
        throw refreshFailure("ERR_BAD_REQUEST", 401); // old refresh token was revoked by logout
      },
      onRefreshFailed,
    });

    const pending = mgr.getFreshToken();
    await clearAuthTokens(); // logout
    await persistAccessToken("NEW_LOGIN", "MAIN"); // new login stores a fresh pair
    await persistRefreshToken("NEW_LOGIN_R", "MAIN");
    release();

    await expect(pending).rejects.toBeInstanceOf(SessionEndedError);
    expect(onRefreshFailed).not.toHaveBeenCalled();
    expect(await getAccessToken("MAIN")).toBe("NEW_LOGIN");
    expect(await getRefreshToken("MAIN")).toBe("NEW_LOGIN_R");
  });
});
