import { STORAGE_KEYS } from "@/enums";
import { getUsersServerData } from "@/server/get-users";
import { serverApiGet } from "@/server/server-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server reads never refresh and never resolve a failure to a cacheable value:
 * they reject with an `ApiResponseError`, so the prefetch is not dehydrated and
 * the client query refetches through axios (which refreshes).
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

describe("server-api", () => {
  beforeEach(() => jar.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("rejects with a 401 (no request made) when the access cookie has expired", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    jar.set(STORAGE_KEYS.SESSION, "1");

    await expect(getUsersServerData()).rejects.toMatchObject({ error_code: 401 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects on a backend 401 and a retryable 5xx instead of returning an empty result", async () => {
    jar.set("accessToken", "AT");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const unauthorized = await getUsersServerData().catch((e: unknown) => e);
    expect(unauthorized).toMatchObject({ error_code: 401, status: "error" });
    expect(unauthorized).not.toHaveProperty("retryable");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(getUsersServerData()).rejects.toMatchObject({ error_code: 503, retryable: true });
  });

  it("rejects with error_code 0 (retryable) when the backend is unreachable", async () => {
    jar.set("accessToken", "AT");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(serverApiGet("/auth/me")).rejects.toMatchObject({
      error_code: 0,
      retryable: true,
    });
  });

  it("forwards only the access cookie and unwraps the envelope on success", async () => {
    jar.set("accessToken", "AT");
    const body = { success: true, data: { user: { _id: "u1" } } };
    const fetchSpy = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(serverApiGet("/auth/me")).resolves.toEqual({ user: { _id: "u1" } });
    expect(fetchSpy.mock.calls[0]![1].headers.cookie).toBe("accessToken=AT");
  });
});
