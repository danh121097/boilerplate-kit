import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { bearerOf, httpError, makeClient } from "@/__tests__/helpers/http-mocks";
import { AuthModel } from "@/services/auth/auth";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
  RefreshTokenManager,
  SessionEndedError,
} from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshedTokens } from "@/services/core";
import axios from "axios";

/**
 * Logout must not be undone by a refresh that is still in flight: the refresh
 * result is dropped when the session ended meanwhile, and logout waits for an
 * in-flight refresh so it revokes the latest rotated refresh token.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

type LockTask = () => Promise<unknown>;

/** Minimal in-order Web Locks stand-in (one queue per lock name); honours an
 * `AbortSignal` while the request is still waiting for the lock. */
function fakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request: (
      name: string,
      optsOrTask: LockTask | { signal?: AbortSignal },
      maybeTask?: LockTask,
    ) => {
      const task = typeof optsOrTask === "function" ? optsOrTask : maybeTask!;
      const signal = typeof optsOrTask === "function" ? undefined : optsOrTask.signal;
      const run = new Promise<unknown>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("aborted", "AbortError"));
        signal?.addEventListener("abort", onAbort);
        void (queues.get(name) ?? Promise.resolve()).then(() => {
          if (signal?.aborted) return;
          signal?.removeEventListener("abort", onAbort);
          return task().then(resolve, reject);
        });
      });
      queues.set(
        name,
        run.catch(() => {}),
      );
      return run;
    },
  };
}

describe("logout vs in-flight refresh", () => {
  beforeEach(() => {
    installLocalStorage();
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a refresh resolving after the session was cleared persists nothing", async () => {
    vi.stubGlobal("navigator", {});
    const pending = deferred<RefreshedTokens>();
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: () => pending.promise,
      onRefreshFailed,
    });

    const fresh = mgr.getFreshToken("AT");
    clearAuthTokens(); // logout lands first
    pending.resolve({ accessToken: "AT2", refreshToken: "RT2" });

    await expect(fresh).rejects.toBeInstanceOf(SessionEndedError);
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });

  for (const [label, nav] of [
    ["without navigator.locks", () => ({})],
    ["with navigator.locks", () => ({ locks: fakeLocks() })],
  ] as const) {
    it(`logout waits for the in-flight refresh and revokes the rotated token (${label})`, async () => {
      vi.stubGlobal("navigator", nav());
      const pending = deferred<RefreshedTokens>();
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: () => pending.promise,
        onRefreshFailed: () => {},
      });
      const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const fresh = mgr.getFreshToken("AT");
      await new Promise((r) => setTimeout(r, 0)); // the refresh call is on the wire
      const logout = AuthModel.logout();
      await Promise.resolve();
      expect(post).not.toHaveBeenCalled(); // still waiting for the refresh

      pending.resolve({ accessToken: "AT2", refreshToken: "RT2" });
      await expect(fresh).resolves.toBe("AT2");
      await logout;

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/auth/logout",
          data: { refreshToken: "RT2" },
          customHeaders: { authorization: "Bearer AT2" },
        }),
      );
      expect(getAccessToken("MAIN")).toBeNull();
      expect(getRefreshToken("MAIN")).toBeNull();
    });

    it(`logout stops waiting for a hung refresh after 15s (${label})`, async () => {
      vi.useFakeTimers();
      try {
        vi.stubGlobal("navigator", nav());
        const hung = deferred<RefreshedTokens>();
        const mgr = new RefreshTokenManager({
          service: "MAIN",
          refresh: () => hung.promise,
          onRefreshFailed: () => {},
        });
        const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

        void mgr.getFreshToken("AT").catch(() => {});
        await vi.advanceTimersByTimeAsync(0);
        const logout = AuthModel.logout();

        await vi.advanceTimersByTimeAsync(14_999);
        expect(post).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await logout;

        expect(post).toHaveBeenCalledWith(
          expect.objectContaining({ url: "/auth/logout", data: { refreshToken: "RT" } }),
        );
        expect(getAccessToken("MAIN")).toBeNull();

        // The hung refresh finally lands: nothing is written back.
        hung.resolve({ accessToken: "AT2", refreshToken: "RT2" });
        await vi.advanceTimersByTimeAsync(0);
        expect(getAccessToken("MAIN")).toBeNull();
        expect(getRefreshToken("MAIN")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  }

  it("logout sends the captured access token as Bearer and clears tokens even if the request fails", async () => {
    vi.stubGlobal("navigator", {});
    const seen: string[] = [];
    const client = makeClient(async (config) => {
      seen.push(bearerOf(config));
      return httpError(config, 500, { success: false, message: "down" });
    });
    vi.spyOn(AuthModel.api, "post").mockImplementation(((opts: {
      url: string;
      data?: unknown;
      customHeaders?: Record<string, string>;
    }) => client.post(opts.url, opts.data, { headers: opts.customHeaders })) as never);

    await expect(AuthModel.logout()).rejects.toMatchObject({ error_code: 500 });

    expect(seen).toEqual(["AT"]);
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  it("a refresh queued behind logout finds the session ended (with navigator.locks)", async () => {
    vi.stubGlobal("navigator", { locks: fakeLocks() });
    const refresh = vi.fn(async () => ({ accessToken: "AT2", refreshToken: "RT2" }));
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    const logout = AuthModel.logout();
    const fresh = mgr.getFreshToken("AT");

    await logout;
    await expect(fresh).rejects.toMatchObject({ error_code: 401 });
    expect(refresh).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBeNull();
  });

  it("no locks: 401s during the logout request never refresh — the captured token is revoked", async () => {
    vi.stubGlobal("navigator", {}); // navigator.locks missing
    const refreshCall = vi.spyOn(axios, "post"); // the bare refresh client
    let logoutBody: unknown;
    vi.spyOn(AuthModel.api, "post").mockImplementation((async (opts: { data?: unknown }) => {
      logoutBody = opts.data;
      await new Promise((r) => setTimeout(r, 30)); // slow server logout
      return { success: true };
    }) as never);
    // Access token expired: every profile read 401s.
    const client = makeClient(async (config) => httpError(config));

    const logout = AuthModel.logout();
    await new Promise((r) => setTimeout(r, 5)); // logout request in flight
    const reads = Array.from({ length: 5 }, () => client.get("/auth/me"));
    const results = await Promise.allSettled(reads);
    await logout;

    for (const result of results) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        error_code: 401,
        message: "session_ended",
      });
    }
    expect(refreshCall).not.toHaveBeenCalled(); // no /auth/refresh at all
    expect(logoutBody).toEqual({ refreshToken: "RT" }); // the captured token
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  it("refreshes work again once logout finished (a new login)", async () => {
    vi.stubGlobal("navigator", {});
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();

    persistAccessToken("AT9", "MAIN");
    persistRefreshToken("RT9", "MAIN");
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => ({ accessToken: "AT10" }),
      onRefreshFailed: () => {},
    });
    await expect(mgr.getFreshToken("AT9")).resolves.toBe("AT10");
  });
});
