import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import {
  RefreshRejectedError,
  RefreshUnavailableError,
  SessionClearedError,
} from "@/services/core/refresh-errors";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";

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

  it("clears the tokens and fires onRefreshFailed when the server rejects the refresh", async () => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    const onRefreshFailed = jest.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw new RefreshRejectedError(401);
      },
      onRefreshFailed,
    });

    await expect(mgr.getFreshToken()).rejects.toBeInstanceOf(RefreshRejectedError);
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    expect(await getAccessToken("MAIN")).toBeNull(); // cleared
    expect(await getRefreshToken("MAIN")).toBeNull();
  });

  it.each([
    ["offline", new RefreshUnavailableError(0, "ERR_NETWORK")],
    ["rate-limited", new RefreshUnavailableError(429, "ERR_BAD_REQUEST")],
    ["server error", new RefreshUnavailableError(503, "ERR_BAD_RESPONSE")],
    ["unknown error", new Error("boom")],
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

    await expect(pending).rejects.toBeInstanceOf(SessionClearedError);
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
        throw new RefreshRejectedError(401); // old refresh token was revoked by logout
      },
      onRefreshFailed,
    });

    const pending = mgr.getFreshToken();
    await clearAuthTokens(); // logout
    await persistAccessToken("NEW_LOGIN", "MAIN"); // new login stores a fresh pair
    await persistRefreshToken("NEW_LOGIN_R", "MAIN");
    release();

    await expect(pending).rejects.toBeInstanceOf(SessionClearedError);
    expect(onRefreshFailed).not.toHaveBeenCalled();
    expect(await getAccessToken("MAIN")).toBe("NEW_LOGIN");
    expect(await getRefreshToken("MAIN")).toBe("NEW_LOGIN_R");
  });
});

describe("refresh errors", () => {
  it.each([
    ["rejected", new RefreshRejectedError(403), 403, "refresh_rejected"],
    ["unavailable", new RefreshUnavailableError(429, "ERR_BAD_REQUEST"), 429, "ERR_BAD_REQUEST"],
    ["session cleared", new SessionClearedError(), 401, "session_ended"],
  ])("%s carries the ApiResponseError envelope fields", (_l, error, code, errorMessage) => {
    expect(error).toMatchObject({
      status: "error",
      error_code: code,
      error_message: errorMessage,
    });
    expect(typeof error.message).toBe("string");
  });
});
