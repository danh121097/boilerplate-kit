import { STORAGE_KEYS } from "@/enums";
import { getMeServerFn } from "@/server/get-me";
import { serverApiGet, serverApiPaginate } from "@/server/server-api";
import { readServerSession } from "@/server/session";
import { fetchSession } from "@/services/auth/session";
import { registerSessionRefresher, withSessionRefresh } from "@/services/core/server-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-function reads: an expired access cookie must never be cached as
 * "signed out" / an empty list. The server never refreshes: it reports
 * `ServerUnauthorized` and the browser refreshes + replays once.
 */

const requestCookies = new Map<string, string>();

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => requestCookies.get(name),
}));

vi.mock("@/server/get-me", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/get-me")>()),
  getMeServerFn: vi.fn(),
}));

const UNAUTHORIZED_HINTED = { unauthorized: true, hasSession: true } as const;
const UNAUTHORIZED_ANON = { unauthorized: true, hasSession: false } as const;

describe("withSessionRefresh (browser)", () => {
  beforeEach(() => vi.stubGlobal("window", {}));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes once and replays when the server reports an expired session", async () => {
    const refresher = vi.fn().mockResolvedValue(undefined);
    registerSessionRefresher(refresher);
    const call = vi
      .fn()
      .mockResolvedValueOnce(UNAUTHORIZED_HINTED)
      .mockResolvedValueOnce({ data: ["u1"] });

    await expect(withSessionRefresh(call)).resolves.toEqual({ data: ["u1"] });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("passes when the failed call started, so a refresh another tab finished since is reused", async () => {
    const refresher = vi.fn().mockResolvedValue(undefined);
    registerSessionRefresher(refresher);
    const before = Date.now();
    const call = vi
      .fn()
      .mockResolvedValueOnce(UNAUTHORIZED_HINTED)
      .mockResolvedValueOnce({ data: [] });

    await withSessionRefresh(call, "MAIN");
    const [service, sentAt] = refresher.mock.calls[0] as [string, number];
    expect(service).toBe("MAIN");
    expect(sentAt).toBeGreaterThanOrEqual(before);
    expect(sentAt).toBeLessThanOrEqual(Date.now());
  });

  it("anonymous: rejects with 401 without any refresh", async () => {
    const refresher = vi.fn();
    registerSessionRefresher(refresher);

    await expect(withSessionRefresh(async () => UNAUTHORIZED_ANON)).rejects.toMatchObject({
      error_code: 401,
    });
    expect(refresher).not.toHaveBeenCalled();
  });

  it("refused refresh rejects with 401 (session ended), no replay loop", async () => {
    const refused = Object.assign(new Error("refresh 401"), { response: { status: 401 } });
    registerSessionRefresher(vi.fn().mockRejectedValue(refused));
    const call = vi.fn().mockResolvedValue(UNAUTHORIZED_HINTED);

    await expect(withSessionRefresh(call)).rejects.toMatchObject({ error_code: 401 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("transient refresh failure rejects retryable (not 401), so the session is not cached as signed out", async () => {
    const down = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    registerSessionRefresher(vi.fn().mockRejectedValue(down));
    const call = vi.fn().mockResolvedValue(UNAUTHORIZED_HINTED);

    const error = await withSessionRefresh(call).catch((e: unknown) => e);
    expect(error).toMatchObject({ retryable: true });
    expect((error as { error_code: number }).error_code).not.toBe(401);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("fetchSession maps signed-out to null but rethrows other failures", async () => {
    const getMe = vi.mocked(getMeServerFn as unknown as () => Promise<unknown>);

    getMe.mockResolvedValueOnce(UNAUTHORIZED_ANON);
    await expect(fetchSession()).resolves.toBeNull();

    getMe.mockRejectedValueOnce(new Error("503"));
    await expect(fetchSession()).rejects.toThrow("503");
  });
});

describe("withSessionRefresh (SSR)", () => {
  it("defers a hinted session to the browser instead of resolving signed-out", async () => {
    const error = await withSessionRefresh(async () => UNAUTHORIZED_HINTED).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as { error_code?: number }).error_code).toBeUndefined();
  });
});

describe("server-side session read (SSR, fetchSession → readServerSession)", () => {
  beforeEach(() => {
    requestCookies.clear();
    requestCookies.set("accessToken", "AT");
    vi.mocked(getMeServerFn as unknown as () => Promise<unknown>).mockImplementation(
      readServerSession,
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(getMeServerFn as unknown as () => Promise<unknown>).mockReset();
  });

  it("session hint + backend 401 rejects — never cached as signed out", async () => {
    requestCookies.set(STORAGE_KEYS.SESSION, "1");
    const error = await fetchSession().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error); // deferred to the browser, which refreshes
    expect((error as { error_code?: number }).error_code).toBeUndefined();
  });

  it("no session hint + backend 401 resolves to null (anonymous)", async () => {
    await expect(fetchSession()).resolves.toBeNull();
  });
});

describe("server-api authedFetch", () => {
  beforeEach(() => requestCookies.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("reports ServerUnauthorized (with the hint) when the access cookie is gone and no refresh cookie is sent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    requestCookies.set(STORAGE_KEYS.SESSION, "1");

    await expect(serverApiPaginate("/users")).resolves.toEqual(UNAUTHORIZED_HINTED);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never refreshes on the server: a backend 401 reports ServerUnauthorized even with the refresh cookie", async () => {
    requestCookies.set("accessToken", "EXPIRED");
    requestCookies.set("refreshToken", "RT");
    requestCookies.set(STORAGE_KEYS.SESSION, "1");
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(serverApiGet("/auth/me")).resolves.toEqual(UNAUTHORIZED_HINTED);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).not.toContain("/auth/refresh");
  });

  it("rejects a non-auth failure with a retryable ApiResponseError instead of an empty value", async () => {
    requestCookies.set("accessToken", "AT");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));

    await expect(serverApiPaginate("/users")).rejects.toMatchObject({
      status: "error",
      error_code: 503,
      retryable: true,
    });
  });

  it("rejects with error_code 0 when the backend is unreachable", async () => {
    requestCookies.set("accessToken", "AT");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(serverApiGet("/auth/me")).rejects.toMatchObject({
      error_code: 0,
      retryable: true,
    });
  });
});
