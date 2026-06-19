import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
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

describe("interceptors — cookie refresh", () => {
  beforeEach(() => {
    Api.setBaseURL("http://api.test", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes once and replays the failed request transparently", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue(REFRESH_OK);

    let calls = 0;
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
    const post = vi
      .spyOn(axios, "post")
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(REFRESH_OK), 10)),
      );

    let calls = 0;
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

  it("attempts refresh even without a stored token (cookie-first: no token gate)", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue(REFRESH_OK);
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return calls === 1 ? httpError(config) : ok(config, { success: true, data: [] });
    });

    await client.get("/public");
    expect(post).toHaveBeenCalledTimes(1);
  });
});
