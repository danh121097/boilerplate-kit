import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api, onSessionExpired } from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * 401 handling that must never reload the page: credential endpoints skip the
 * refresh, a refused refresh announces session expiry and rejects, a transient
 * refresh failure does not end the session, and a service without refresh
 * config just rejects.
 */

const refreshRefused = () =>
  Promise.reject(
    Object.assign(new Error("Request failed with status code 401"), {
      isAxiosError: true,
      response: { status: 401, data: { success: false, message: "Refresh token revoked" } },
    }),
  );

describe("interceptors — 401 without reload", () => {
  const reload = vi.fn();
  let expired: ReturnType<typeof vi.fn<(service: string) => void>>;
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.stubGlobal("window", { location: { reload } });
    Api.setBaseURL("http://api.test", "MAIN");
    expired = vi.fn<(service: string) => void>();
    unsubscribe = onSessionExpired(expired);
  });

  afterEach(() => {
    unsubscribe();
    reload.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("login 401 (wrong password) neither refreshes nor reloads", async () => {
    const post = vi.spyOn(axios, "post");
    const client = makeClient(async (config) =>
      httpError(config, 401, { success: false, error_code: 401, message: "Invalid credentials" }),
    );

    await expect(
      client.post("/auth/login", { email: "a@b.c", password: "bad" }),
    ).rejects.toMatchObject({ error_code: 401, message: "Invalid credentials" });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it("refresh refused → announces expiry and rejects 401, no reload", async () => {
    vi.spyOn(axios, "post").mockImplementation(refreshRefused);
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(calls).toBe(1); // not replayed after a refused refresh
    expect(reload).not.toHaveBeenCalled();
    expect(expired).toHaveBeenCalledWith("MAIN");
  });

  it("refresh answered 403 ends the session like a 401", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("Request failed with status code 403"), {
        isAxiosError: true,
        response: { status: 403, data: { success: false, message: "Forbidden" } },
      }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 403 });
    expect(expired).toHaveBeenCalledWith("MAIN");
  });

  for (const [label, status, code] of [
    ["429", 429, undefined],
    ["503", 503, undefined],
    ["a timeout", undefined, "ECONNABORTED"],
  ] as const) {
    it(`refresh failing with ${label} rejects as retryable and keeps the session`, async () => {
      vi.spyOn(axios, "post").mockRejectedValue(
        Object.assign(new Error("refresh failed"), {
          isAxiosError: true,
          code,
          response: status ? { status, data: { success: false, message: "busy" } } : undefined,
        }),
      );
      const client = makeClient(async (config) => httpError(config));

      await expect(client.get("/users")).rejects.toMatchObject({
        error_code: status ?? 0,
        retryable: true,
      });
      expect(expired).not.toHaveBeenCalled();
    });
  }

  it("the refresh call is capped by a 15s timeout", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    let calls = 0;
    const client = makeClient(async (config) =>
      ++calls === 1 ? httpError(config) : ok(config, { success: true, data: 1 }),
    );

    await client.get("/users");
    expect(post.mock.calls[0]?.[2]).toMatchObject({ timeout: 15_000 });
  });

  it("transient refresh failure (network) does not end the session", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 0 });
    expect(expired).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("refreshed replay still 401 → announces expiry, no reload", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("service without refresh config: 401 just rejects, no refresh, no reload", async () => {
    const post = vi.spyOn(axios, "post");
    const client = makeClient(async (config) => httpError(config), {});

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("anonymous visitor (no session hint): 401 is final — no refresh call, no expiry", async () => {
    const post = vi.spyOn(axios, "post");
    let calls = 0;
    const client = makeClient(
      async (config) => {
        calls += 1;
        return httpError(config);
      },
      { MAIN: { endpoint: "/auth/refresh", hasSession: () => false } },
    );

    await expect(client.get("/auth/me")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(calls).toBe(1);
    expect(expired).not.toHaveBeenCalled();
  });

  it("session hint present: refreshes, and renews the hint on success", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    const onRefreshed = vi.fn();
    let calls = 0;
    const client = makeClient(
      async (config) => (++calls === 1 ? httpError(config) : ok(config, { success: true })),
      { MAIN: { endpoint: "/auth/refresh", hasSession: () => true, onRefreshed } },
    );

    await client.get("/users");
    expect(calls).toBe(2);
    expect(onRefreshed).toHaveBeenCalledTimes(1);
  });

  it("successful refresh + replay does not announce expiry", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    let calls = 0;
    const client = makeClient(async (config) =>
      ++calls === 1 ? httpError(config) : ok(config, { success: true, data: 1 }),
    );

    await client.get("/users");
    expect(expired).not.toHaveBeenCalled();
  });
});
