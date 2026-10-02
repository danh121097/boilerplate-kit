import { hasServerSessionHint, serverApiGet } from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs as the Nuxt server bundle does (`import.meta.server = true`): the SSR
 * request path forwards only the access cookie to the backend and tolerates a
 * malformed cookie value instead of throwing.
 */

function stubServer(cookie: string) {
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appEndpoint: "http://api.test", apiPrefix: "/api/v1" },
  }));
  vi.stubGlobal("useRequestHeaders", () => ({ cookie }));
  const fetchMock = vi.fn(async (_url: string, _opts: { headers: Record<string, string> }) => ({
    success: true,
    data: { ok: true },
  }));
  vi.stubGlobal("$fetch", fetchMock);
  return fetchMock;
}

describe("server-side cookie handling", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("forwards only the accessToken cookie to the backend", async () => {
    const fetchMock = stubServer(
      "accessToken=abc.def; refreshToken=r1; PRISM_APP_SESSION=1; theme=dark",
    );
    await serverApiGet("/auth/me");

    const opts = fetchMock.mock.calls[0]![1];
    expect(opts.headers.cookie).toBe("accessToken=abc.def");
  });

  it("sends no cookie header when there is no accessToken", async () => {
    const fetchMock = stubServer("refreshToken=r1; PRISM_APP_SESSION=1");
    await serverApiGet("/auth/me");

    const opts = fetchMock.mock.calls[0]![1];
    expect(opts.headers).not.toHaveProperty("cookie");
  });

  it("treats a malformed accessToken value as absent instead of throwing", async () => {
    const fetchMock = stubServer("accessToken=%E0%A4%A; PRISM_APP_SESSION=1");
    await expect(serverApiGet("/auth/me")).resolves.toEqual({ ok: true });

    const opts = fetchMock.mock.calls[0]![1];
    expect(opts.headers).not.toHaveProperty("cookie");
  });

  it("a malformed session hint cookie reads as no hint", () => {
    stubServer("PRISM_APP_SESSION=%E0%A4%A");
    expect(hasServerSessionHint()).toBe(false);
  });
});
