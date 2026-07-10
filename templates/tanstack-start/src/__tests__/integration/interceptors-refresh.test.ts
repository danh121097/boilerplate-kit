import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api } from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axios from "axios";

/**
 * End-to-end test of 401 → refresh → replay through the real interceptors
 * (cookie-based auth). The app instance 401s on the first attempt and 200s on the
 * replay; the bare refresh client's `axios.post` is stubbed (the backend would
 * rotate the httpOnly cookies). The replay is distinguished by `config._retry`,
 * which the response interceptor sets before replaying — there is no Bearer
 * header or localStorage anymore.
 */

const retried = (config: InternalAxiosRequestConfig) =>
  Boolean((config as InternalAxiosRequestConfig & { _retry?: boolean })._retry);

describe("interceptors — cookie-based token refresh", () => {
  beforeEach(() => {
    Api.setBaseURL("http://api.test", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes once and replays the failed request transparently", async () => {
    let calls = 0;

    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} } as never);
    const client = makeClient(async (config) => {
      calls += 1;
      return retried(config) ? ok(config, { success: true, data: ["item"] }) : httpError(config);
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
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 10)) as never,
      );

    const client = makeClient(async (config) =>
      retried(config) ? ok(config, { success: true, data: 1 }) : httpError(config),
    );

    const results = await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
  });

  it("propagates a non-auth failure on the replay without retrying again", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} } as never);

    const client = makeClient(async (config) =>
      retried(config) ? httpError(config, 500, { message: "boom" }) : httpError(config),
    );

    await expect(client.get("/users")).rejects.toMatchObject({ message: "boom" });
    expect(post).toHaveBeenCalledTimes(1); // refreshed once; the 500 is not an auth error
  });

  it("gives up after one retry (no infinite loop) when the replay still 401s", async () => {
    let calls = 0;

    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} } as never);
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/users")).rejects.toBeTruthy();
    expect(calls).toBe(2); // original + one replay, then stop (_retry guard)
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("propagates the error when the refresh call itself fails (e.g. no session)", async () => {
    let calls = 0;

    const post = vi.spyOn(axios, "post").mockRejectedValue(new Error("no refresh cookie"));
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/private")).rejects.toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1); // one refresh attempt
    expect(calls).toBe(1); // original request only — never replayed
  });
});
