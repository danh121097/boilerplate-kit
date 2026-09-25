import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { refreshFailure } from "@/__tests__/helpers/http-mocks";
import { SessionEndedError } from "@/services/core/api-errors";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import {
  RefreshTokenManager,
  SESSION_WAIT_TIMEOUT_MS,
  withSessionLock,
} from "@/services/core/refresh-token-manager";
import { beginLogout } from "@/services/core/session";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("RefreshTokenManager", () => {
  beforeEach(() => resetSecureStore());

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

describe("withSessionLock", () => {
  beforeEach(() => resetSecureStore());

  it("runs the task at once when no refresh is in flight", async () => {
    const task = jest.fn(async () => "done");
    const result = withSessionLock("MAIN", task);
    expect(task).toHaveBeenCalledTimes(1); // no await before the task
    expect(await result).toBe("done");
  });

  it("waits for the in-flight refresh to settle before running the task", async () => {
    let release: () => void = () => {};

    const gate = new Promise<void>((r) => (release = r));
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        await gate;
        return { accessToken: "T" };
      },
      onRefreshFailed: () => {},
    });
    const refreshing = mgr.getFreshToken();
    const task = jest.fn(async () => getAccessToken("MAIN"));

    const locked = withSessionLock("MAIN", task);
    await tick();
    expect(task).not.toHaveBeenCalled();
    release();

    expect(await locked).toBe("T"); // the task saw the rotated token
    await refreshing;
  });

  it("stops waiting for a hung refresh after the cap", async () => {
    jest.useFakeTimers();
    let fail: (error: Error) => void = () => {};
    try {
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: () => new Promise((_resolve, reject) => (fail = reject)),
        onRefreshFailed: () => {},
      });
      const hung = mgr.getFreshToken().catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);
      const task = jest.fn(async () => "ran");

      const locked = withSessionLock("MAIN", task);
      await jest.advanceTimersByTimeAsync(SESSION_WAIT_TIMEOUT_MS - 1);
      expect(task).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);

      expect(await locked).toBe("ran");
      fail(new Error("released"));
      await hung;
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("SessionEndedError", () => {
  it("carries the ApiResponseError envelope fields", () => {
    expect(new SessionEndedError()).toMatchObject({
      status: "error",
      error_code: 401,
      error_message: "session_ended",
      message: "session_ended",
    });
  });
});
