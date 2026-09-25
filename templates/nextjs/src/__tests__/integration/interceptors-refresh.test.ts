import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { APP_PREFIX, STORAGE_KEYS } from "@/enums";
import { Api } from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * End-to-end test of 401 → refresh → replay through the real interceptors.
 * Cookie-first: the refresh call sends no token body — the httpOnly cookie is
 * forwarded automatically. The axios `post` for refresh is stubbed to resolve
 * (cookie rotation is a backend side-effect; the client just replays its request).
 */

const REFRESH_OK = { data: { status: "success" } } as never;

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

describe("interceptors — cookie refresh", () => {
  beforeEach(() => {
    Api.setBaseURL("http://api.test", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes once and replays the failed request transparently", async () => {
    let calls = 0;

    const post = vi.spyOn(axios, "post").mockResolvedValue(REFRESH_OK);
    const client = makeClient(async (config) => {
      calls += 1;
      // First call 401s; after refresh the same request succeeds.
      return calls === 1 ? httpError(config) : ok(config, { success: true, data: ["item"] });
    });

    const result = await client.get("/users");

    expect((result as unknown as { data: string[] }).data).toEqual(["item"]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  it("single-flights concurrent 401s into ONE refresh", async () => {
    let calls = 0;

    const post = vi
      .spyOn(axios, "post")
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(REFRESH_OK), 10)),
      );
    const client = makeClient(async (config) => {
      calls += 1;
      return calls <= 3 ? httpError(config) : ok(config, { success: true, data: 1 });
    });

    const results = await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
  });

  it("does NOT reload when the replay fails for a non-auth reason", async () => {
    vi.spyOn(axios, "post").mockResolvedValue(REFRESH_OK);

    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return calls === 1 ? httpError(config) : httpError(config, 500, { message: "boom" });
    });

    await expect(client.get("/users")).rejects.toMatchObject({ message: "boom" });
  });

  it("gives up after one retry (no infinite loop)", async () => {
    vi.spyOn(axios, "post").mockResolvedValue(REFRESH_OK);

    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/users")).rejects.toBeTruthy();
    expect(calls).toBe(2);
  });

  it("without a hasSession option, refreshes only while the session hint is present", async () => {
    vi.stubGlobal("document", { cookie: "" });
    const post = vi.spyOn(axios, "post").mockResolvedValue(REFRESH_OK);
    const client = makeClient(async (config) => httpError(config), {
      MAIN: { endpoint: "/auth/refresh" },
    });

    await expect(client.get("/public")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled(); // anonymous: no hint, no refresh

    document.cookie = `${STORAGE_KEYS.SESSION}=1`;
    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("replays without refreshing when a refresh finished after the request was sent", async () => {
    installLocalStorage();
    const post = vi.spyOn(axios, "post").mockResolvedValue(REFRESH_OK);
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      if (calls > 1) return ok(config, { success: true, data: 1 });
      // Another tab rotates the cookies while this request is on the wire.
      localStorage.setItem(`${APP_PREFIX}:auth-refresh:MAIN:at`, String(Date.now() + 1));
      return httpError(config);
    });

    await expect(client.get("/users")).resolves.toMatchObject({ data: 1 });
    expect(post).not.toHaveBeenCalled();
    expect(calls).toBe(2);
    vi.unstubAllGlobals();
  });
});
