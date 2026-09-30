import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api, onSessionEnded } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import axios from "axios";

/**
 * What a 401 answered by a refresh leads to: a refused refresh ends the session
 * without reloading, any other refresh failure keeps it and rejects retryable,
 * and a successful refresh replays the request.
 */

const REFRESH = {
  MAIN: {
    endpoint: "/auth/refresh",
    skipPaths: ["/auth/login", "/auth/register", "/auth/logout"],
  },
};

/** What the bare refresh client's `axios.post` rejects with. */
function refreshError(failure: { status?: number; code?: string }) {
  return Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    code: failure.code,
    response: failure.status ? { status: failure.status, data: {} } : undefined,
  });
}

function setup() {
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  const post = vi.spyOn(axios, "post");
  const client = (adapter: Parameters<typeof makeClient>[0]) => makeClient(adapter, REFRESH);
  return { reload, post, client };
}

describe("refresh outcomes", () => {
  beforeEach(() => {
    installLocalStorage();
    Api.setBaseURL("http://api.test", "MAIN");
  });

  // Runs after each test's own onTestFinished cleanups, which unsubscribe
  // from the stubbed globals.
  beforeEach(({ onTestFinished }) => {
    onTestFinished(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  it("refresh failure ends the session without reloading and rejects with the original 401", async () => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, reload, client } = setup();
    post.mockRejectedValue(refreshError({ status: 401 }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(reload).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it.each([
    ["network error", { code: "ERR_NETWORK" }],
    ["timeout", { code: "ECONNABORTED" }],
    ["503", { status: 503 }],
    ["429", { status: 429 }],
    ["400", { status: 400 }],
  ])(
    "transient refresh failure (%s) keeps tokens, no session end, rejects retryable",
    async (_label, failure) => {
      persistAccessToken("OLD");
      persistRefreshToken("RT");
      const { post, reload, client } = setup();
      post.mockRejectedValue(refreshError(failure));
      const ended = vi.fn();
      const off = onSessionEnded(ended);
      onTestFinished(off);

      const http = client(async (config) => httpError(config, 401));

      const error = await http.get("/users").catch((e: unknown) => e);
      expect(error).toMatchObject({ retryable: true, message: "refresh_unavailable" });
      expect((error as { error_code: number }).error_code).not.toBe(401);
      expect(ended).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe("OLD");
      expect(getRefreshToken()).toBe("RT");
    },
  );

  it("a refresh answering 200 without an access token keeps the session and rejects retryable", async () => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockResolvedValue({ data: { data: {} } });
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 0, retryable: true });
    expect(ended).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe("RT");
  });

  it("the refresh request gives up after 15s so a hung refresh cannot stall requests", async () => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockResolvedValue({ data: { data: { tokens: { accessToken: "NEW" } } } });
    const http = client(async (config) =>
      config._retry ? ok(config, { success: true, data: 1 }) : httpError(config, 401),
    );

    await http.get("/users");

    expect(post.mock.calls[0]![2]).toMatchObject({ timeout: 15_000 });
  });

  it.each([
    [503, true],
    [429, true],
    [404, false],
  ])(
    "a failed request (%i) carries its status as error_code, retryable=%s",
    async (status, retryable) => {
      const { client } = setup();

      const http = client(async (config) => httpError(config, status));

      const error = (await http.get("/users").catch((e: unknown) => e)) as Record<string, unknown>;

      expect(error.error_code).toBe(status);
      expect(Boolean(error.retryable)).toBe(retryable);
    },
  );

  it.each([401, 403])("refused refresh (%i) ends the session and clears tokens", async (status) => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockRejectedValue(refreshError({ status }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(getRefreshToken()).toBeNull();
  });

  it("refreshes with only a refresh token stored (expired access token was cleared)", async () => {
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockResolvedValue({ data: { data: { tokens: { accessToken: "NEW" } } } } as never);
    let calls = 0;
    const http = client(async (config) => {
      calls += 1;
      return calls === 1 ? httpError(config) : ok(config, { success: true, data: [1] });
    });

    await expect(http.get("/users")).resolves.toMatchObject({ data: [1] });
    expect(getAccessToken()).toBe("NEW");
  });
});
