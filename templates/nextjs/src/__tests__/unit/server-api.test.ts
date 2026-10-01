import { STORAGE_KEYS } from "@/enums";
import { getUsersServerData } from "@/server/get-users";
import { serverApiGet, serverApiPaginate } from "@/server/server-api";
import { isUnauthorizedError } from "@/services/core/api-errors";
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

  it("drops undefined and null params instead of sending ?page=undefined", async () => {
    jar.set("accessToken", "AT");
    const fetchSpy = vi.fn().mockImplementation(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await serverApiPaginate("/users", { page: undefined, limit: 5 });
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/users\?limit=5$/);

    await serverApiPaginate("/users", { page: undefined, limit: undefined });
    expect(String(fetchSpy.mock.calls[1]![0])).toMatch(/\/users$/);

    await serverApiPaginate("/users", { page: null, limit: 5 } as never);
    expect(String(fetchSpy.mock.calls[2]![0])).toMatch(/\/users\?limit=5$/);
  });

  it("keeps falsy-but-defined params: 0, false and an empty string are sent", async () => {
    jar.set("accessToken", "AT");
    const fetchSpy = vi.fn().mockImplementation(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await serverApiPaginate("/users", { page: 0, flag: false, q: "", gone: null } as never);
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/users\?page=0&flag=false&q=$/);
  });

  describe("a rejected request signature (HMAC_ERROR)", () => {
    const hmacBody = {
      success: false,
      message: "HMAC verification failed!",
      errorType: "HMAC_ERROR",
    };

    beforeEach(() => {
      jar.set("accessToken", "AT");
      vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    it("rejects retryable with its errorType, and is not read as a signed-out 401", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => Response.json(hmacBody, { status: 401 })),
      );
      const error = await serverApiGet("/auth/me").catch((e: unknown) => e);
      expect(error).toMatchObject({ error_code: 401, errorType: "HMAC_ERROR", retryable: true });
      expect(isUnauthorizedError(error)).toBe(false);
    });

    it("logs once per process, and not for a plain 401", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.resetModules();
      const { serverApiGet: fresh } = await import("@/server/server-api");

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementation(async () =>
            Response.json({ errorType: "AUTHENTICATION_ERROR" }, { status: 401 }),
          ),
      );
      await fresh("/auth/me").catch(() => {});
      expect(warn).not.toHaveBeenCalled();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => Response.json(hmacBody, { status: 401 })),
      );
      await fresh("/auth/me").catch(() => {});
      await fresh("/auth/me").catch(() => {});
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
