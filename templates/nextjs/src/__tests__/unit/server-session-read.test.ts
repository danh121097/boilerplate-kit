import { STORAGE_KEYS } from "@/enums";
import { readServerSession } from "@/server/session";
import { isUnauthorizedError } from "@/services/core/api-errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server-side session read never refreshes. It tells "anonymous" (null,
 * safe to cache) from "a session that needs a browser refresh" (reject), using
 * the readable session hint the request carries.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

function respond(status: number, body: unknown = {}) {
  const fetchSpy = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("readServerSession", () => {
  beforeEach(() => jar.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("resolves the current user when the access cookie is valid", async () => {
    jar.set("accessToken", "AT");
    respond(200, { success: true, data: { user: { _id: "u1" } } });
    await expect(readServerSession()).resolves.toEqual({ _id: "u1" });
  });

  it("no hint and no access cookie → null (anonymous)", async () => {
    const fetchSpy = respond(200);
    await expect(readServerSession()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no hint + a backend 401 → null (signed out)", async () => {
    jar.set("accessToken", "AT");
    respond(401);
    await expect(readServerSession()).resolves.toBeNull();
  });

  it("hint + an expired access cookie → rejects with 401 so the client refreshes", async () => {
    jar.set(STORAGE_KEYS.SESSION, "1");
    respond(200);
    await expect(readServerSession()).rejects.toMatchObject({ error_code: 401 });
  });

  it("hint + a backend 401 → rejects with 401 so the client refreshes", async () => {
    jar.set("accessToken", "AT");
    jar.set(STORAGE_KEYS.SESSION, "1");
    respond(401);
    await expect(readServerSession()).rejects.toMatchObject({ error_code: 401 });
  });

  it.each([true, false])("a 5xx rejects (retryable), hint present: %s", async (hinted) => {
    jar.set("accessToken", "AT");
    if (hinted) jar.set(STORAGE_KEYS.SESSION, "1");
    respond(503);
    await expect(readServerSession()).rejects.toMatchObject({ error_code: 503, retryable: true });
  });

  it("never calls the refresh endpoint", async () => {
    jar.set("accessToken", "AT");
    jar.set(STORAGE_KEYS.SESSION, "1");
    const fetchSpy = respond(401);
    await readServerSession().catch(() => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/auth/me");
  });
});

describe("readServerSession with a rejected request signature (HMAC_ERROR)", () => {
  const hmacBody = {
    success: false,
    message: "HMAC verification failed!",
    errorType: "HMAC_ERROR",
  };

  beforeEach(() => {
    jar.clear();
    jar.set("accessToken", "AT");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is not a signed-out session: rejects even without a hint, keeping the errorType", async () => {
    respond(401, hmacBody);
    const error = await readServerSession().catch((e: unknown) => e);
    expect(error).toMatchObject({
      error_code: 401,
      errorType: "HMAC_ERROR",
      retryable: true,
    });
    expect(isUnauthorizedError(error)).toBe(false);
  });

  it("logs once per process, and not for a plain 401", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { serverApiGet } = await import("@/server/server-api");

    respond(401, { errorType: "AUTHENTICATION_ERROR" });
    await serverApiGet("/auth/me").catch(() => {});
    expect(warn).not.toHaveBeenCalled();

    respond(401, hmacBody);
    await serverApiGet("/auth/me").catch(() => {});
    await serverApiGet("/auth/me").catch(() => {});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
