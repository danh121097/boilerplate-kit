import { STORAGE_KEYS } from "@/enums";
import { getMeServerData } from "@/server/get-me";
import { getUsersServerData } from "@/server/get-users";
import { ServerAuthError } from "@/server/server-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server reads never refresh and never resolve an auth failure to a cacheable
 * value: an expired access cookie throws, so the prefetch is not dehydrated and
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

  it("throws (not null) when the access cookie has expired", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    jar.set(STORAGE_KEYS.SESSION, "1");

    await expect(getUsersServerData()).rejects.toBeInstanceOf(ServerAuthError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws on a backend 401 and on a 5xx instead of returning an empty result", async () => {
    jar.set("accessToken", "AT");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(getUsersServerData()).rejects.toBeInstanceOf(ServerAuthError);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(getUsersServerData()).rejects.toThrow("503");
  });

  it("getMe: anonymous (no session hint) resolves to null", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(getMeServerData()).resolves.toBeNull();
  });

  it("getMe: a hinted session with an expired access cookie throws so the client refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn());
    jar.set(STORAGE_KEYS.SESSION, "1");
    await expect(getMeServerData()).rejects.toBeInstanceOf(ServerAuthError);
  });

  it("getMe: a hinted session whose backend call returns 401 rejects (client refreshes)", async () => {
    jar.set("accessToken", "AT");
    jar.set(STORAGE_KEYS.SESSION, "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(getMeServerData()).rejects.toBeInstanceOf(ServerAuthError);
  });

  it("getMe: no session hint + a backend 401 resolves to null (signed out)", async () => {
    jar.set("accessToken", "AT");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(getMeServerData()).resolves.toBeNull();
  });

  it("forwards only the access cookie and returns the envelope on success", async () => {
    jar.set("accessToken", "AT");
    const body = { success: true, data: { user: { _id: "u1" } } };
    const fetchSpy = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getMeServerData()).resolves.toEqual({ _id: "u1" });
    expect(fetchSpy.mock.calls[0]![1].headers.cookie).toBe("accessToken=AT");
  });
});
