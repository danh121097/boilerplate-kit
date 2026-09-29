import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { SessionEndedError } from "@/services/core/api-errors";
import { getAccessToken } from "@/services/core/auth-token-storage";
import {
  RefreshTokenManager,
  SESSION_WAIT_TIMEOUT_MS,
  withSessionLock,
} from "@/services/core/refresh-token-manager";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const tick = () => new Promise((r) => setTimeout(r, 5));

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
