import { STORAGE_KEYS } from "@/enums";
import { readServerSession } from "@/server/session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server-side session read never refreshes. It resolves the user, null when
 * the backend knows no user, or `ServerUnauthorized` carrying the request's
 * session hint, so the browser refreshes a hinted session instead of caching
 * "signed out". Other failures reject.
 */

const jar = new Map<string, string>();

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => jar.get(name),
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
    jar.set(STORAGE_KEYS.SESSION, "1");
    respond(200, { success: true, data: { user: { _id: "u1" } } });
    await expect(readServerSession()).resolves.toEqual({ _id: "u1" });
  });

  it("resolves null when the backend knows no user", async () => {
    jar.set("accessToken", "AT");
    jar.set(STORAGE_KEYS.SESSION, "1");
    respond(200, { success: true, data: {} });
    await expect(readServerSession()).resolves.toBeNull();
  });

  it("no access cookie and no hint → unauthorized without a session (anonymous)", async () => {
    const fetchSpy = respond(200);
    await expect(readServerSession()).resolves.toEqual({ unauthorized: true, hasSession: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no hint → no request, even with a live access cookie (a failed logout leaves it)", async () => {
    jar.set("accessToken", "AT");
    const fetchSpy = respond(200, { success: true, data: { user: { _id: "u1" } } });
    await expect(readServerSession()).resolves.toEqual({ unauthorized: true, hasSession: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hint + an expired access cookie → unauthorized with a session, so the browser refreshes", async () => {
    jar.set(STORAGE_KEYS.SESSION, "1");
    respond(200);
    await expect(readServerSession()).resolves.toEqual({ unauthorized: true, hasSession: true });
  });

  it("hint + a backend 401 → unauthorized with a session", async () => {
    jar.set("accessToken", "AT");
    jar.set(STORAGE_KEYS.SESSION, "1");
    respond(401);
    await expect(readServerSession()).resolves.toEqual({ unauthorized: true, hasSession: true });
  });

  it("a 5xx rejects (retryable) for a hinted session", async () => {
    jar.set("accessToken", "AT");
    jar.set(STORAGE_KEYS.SESSION, "1");
    respond(503);
    await expect(readServerSession()).rejects.toMatchObject({ error_code: 503, retryable: true });
  });

  it("never calls the refresh endpoint", async () => {
    jar.set("accessToken", "AT");
    jar.set(STORAGE_KEYS.SESSION, "1");
    const fetchSpy = respond(401);
    await readServerSession();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/auth/me");
  });
});
