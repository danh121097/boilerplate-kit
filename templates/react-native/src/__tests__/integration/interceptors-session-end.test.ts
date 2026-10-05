import { resetStorage } from "@/__tests__/helpers/fake-storage";
import {
  bearerOf,
  httpError,
  MAIN_REFRESH,
  makeClient,
  ok,
  refreshFailure,
} from "@/__tests__/helpers/http-mocks";
import { AuthModel } from "@/services/auth";
import { Api, onSessionEnded, registerServiceToken, SessionEndedError } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import axios from "axios";

/**
 * How a 401 interacts with the end of a session, through the real interceptors:
 * a logout (or a new login) landing while the 401 handler awaits its storage
 * reads, a token already rotated by an earlier refresh, and a secondary
 * service's refused refresh.
 */

function deferred() {
  let resolve: () => void = () => {};

  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("interceptors — 401s racing the end of a session", () => {
  let sessionEnded: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(async () => {
    resetStorage();
    Api.setBaseURL("http://api.test", "MAIN");
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    sessionEnded = jest.fn();
    unsubscribe = onSessionEnded(sessionEnded);
  });

  afterEach(() => {
    unsubscribe();
    jest.restoreAllMocks();
  });

  it("a 401 arriving while logout is reading tokens does not refresh or fire session-ended", async () => {
    const refreshPost = jest.spyOn(axios, "post");
    const logoutPost = jest
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true } as never);
    // The 401 handler's session check is held open while logout runs to the end.
    const sessionCheck = deferred();
    const client = makeClient(async (config) => httpError(config), {
      MAIN: {
        ...MAIN_REFRESH.MAIN,
        hasSession: () => sessionCheck.promise.then(() => true),
      },
    });

    const request = client.get("/users").catch((e: unknown) => e);
    await flush(); // the 401 handler is now awaiting the session check
    await AuthModel.logout(); // reads the tokens, ends the epoch, revokes, clears
    sessionCheck.resolve();
    const error = await request;

    expect(error).toBeInstanceOf(SessionEndedError);
    expect(error).toMatchObject({ error_code: 401, message: "session_ended" });
    expect(refreshPost).not.toHaveBeenCalled();
    expect(logoutPost).toHaveBeenCalledWith(
      expect.objectContaining({ data: { refreshToken: "OLD_R" } }),
    );
    expect(sessionEnded).toHaveBeenCalledTimes(1);
    expect(sessionEnded).toHaveBeenCalledWith("logout", "MAIN");
  });

  it("does not replay an old session's 401 with a token from a login made meanwhile", async () => {
    const refreshPost = jest.spyOn(axios, "post");
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const sessionCheck = deferred();
    let calls = 0;
    const client = makeClient(
      async (config) => {
        calls += 1;
        return bearerOf(config) === "NEXT" ? ok(config, { success: true }) : httpError(config);
      },
      { MAIN: { ...MAIN_REFRESH.MAIN, hasSession: () => sessionCheck.promise.then(() => true) } },
    );

    const request = client.get("/users").catch((e: unknown) => e);
    await flush();
    await AuthModel.logout();
    await persistAccessToken("NEXT", "MAIN"); // another user signs in
    sessionCheck.resolve();

    expect(await request).toBeInstanceOf(SessionEndedError);
    expect(calls).toBe(1); // never replayed with the new session's token
    expect(refreshPost).not.toHaveBeenCalled();
  });

  it("rejects a 401 with session_ended while a logout is pending, without refreshing", async () => {
    let releaseLogout: () => void = () => {};

    const refreshPost = jest.spyOn(axios, "post");
    jest
      .spyOn(AuthModel.api, "post")
      .mockImplementation(() => new Promise((r) => (releaseLogout = () => r({} as never))));
    const client = makeClient(async (config) => httpError(config));

    const loggingOut = AuthModel.logout();
    await flush(); // logout captured the tokens and is revoking them
    const error = await client.get("/users").catch((e: unknown) => e);
    releaseLogout();
    await loggingOut;

    expect(error).toBeInstanceOf(SessionEndedError);
    expect(refreshPost).not.toHaveBeenCalled();
    expect(sessionEnded).not.toHaveBeenCalledWith("expired", expect.anything());
  });

  it("replays with the stored token, without refreshing, when an earlier refresh already rotated it", async () => {
    const refreshPost = jest.spyOn(axios, "post");
    const client = makeClient(async (config) => {
      if (bearerOf(config) === "OLD") {
        await persistAccessToken("ROTATED", "MAIN"); // an earlier refresh finished meanwhile
        return httpError(config);
      }
      return ok(config, { success: true, data: bearerOf(config) });
    });

    const result = (await client.get("/users")) as unknown as { data: string };

    expect(result.data).toBe("ROTATED");
    expect(refreshPost).not.toHaveBeenCalled();
  });

  it("a refused refresh of another service ends only that service's session", async () => {
    registerServiceToken("ADMIN", { access: "ADMIN_ACCESS", refresh: "ADMIN_REFRESH" });
    Api.setBaseURL("http://admin.test", "ADMIN");
    await persistAccessToken("ADMIN_OLD", "ADMIN");
    jest.spyOn(axios, "post").mockRejectedValue(refreshFailure("ERR_BAD_REQUEST", 401));
    const client = makeClient(
      async (config) => httpError(config),
      { ADMIN: { endpoint: "/auth/refresh" } },
      "ADMIN",
    );

    await expect(client.get("/reports")).rejects.toMatchObject({ error_code: 401 });

    expect(sessionEnded).toHaveBeenCalledTimes(1);
    expect(sessionEnded).toHaveBeenCalledWith("expired", "ADMIN");
    expect(await getAccessToken("ADMIN")).toBeNull();
    expect(await getAccessToken("MAIN")).toBe("OLD");
    expect(await getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it("passes a 401 of a service without refresh through, keeping its tokens", async () => {
    registerServiceToken("PARTNER", { access: "PARTNER_ACCESS", refresh: "PARTNER_REFRESH" });
    await persistAccessToken("P", "PARTNER");
    const refreshPost = jest.spyOn(axios, "post");
    const client = makeClient(async (config) => httpError(config), MAIN_REFRESH, "PARTNER");

    await expect(client.get("/things")).rejects.toMatchObject({ error_code: 401 });

    expect(refreshPost).not.toHaveBeenCalled();
    expect(await getAccessToken("PARTNER")).toBe("P");
    expect(sessionEnded).not.toHaveBeenCalled();
  });
});
