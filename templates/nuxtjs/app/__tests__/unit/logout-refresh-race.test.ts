import { deferred, fakeLocks } from "@/__tests__/helpers/fake-locks";
import { httpError, makeClient } from "@/__tests__/helpers/http-mocks";
import { AuthModel } from "@/services/auth";
import {
  endSession,
  hasSessionHint,
  markSessionActive,
  onSessionEnded,
  RefreshTokenManager,
} from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * Logout must not be undone by a refresh that is still in flight: a refresh
 * landing after logout does not re-mark the session (no hint written back), and
 * logout waits for an in-flight refresh so it revokes the latest rotated cookie.
 */

describe("logout vs in-flight refresh", () => {
  let doc: { cookie: string };

  beforeEach(() => {
    doc = { cookie: "" };
    vi.stubGlobal("document", doc);
    markSessionActive();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a refresh resolving after logout writes no hint and fires no hooks", async () => {
    vi.stubGlobal("navigator", {});
    const pending = deferred();
    const onRefreshed = vi.fn(markSessionActive);
    const onRefreshFailed = vi.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: () => pending.promise,
      onRefreshed,
      onRefreshFailed,
    });

    const fresh = mgr.refresh(Date.now());
    // The session ends (logout / expiry) before the refresh response lands.
    endSession("logout", "MAIN");
    pending.resolve();

    await expect(fresh).rejects.toMatchObject({ error_code: 401, message: "session_ended" });
    expect(onRefreshed).not.toHaveBeenCalled();
    expect(onRefreshFailed).not.toHaveBeenCalled();
    expect(hasSessionHint()).toBe(false);
  });

  for (const [label, nav] of [
    ["without navigator.locks", () => ({})],
    ["with navigator.locks", () => ({ locks: fakeLocks() })],
  ] as const) {
    it(`logout waits for the in-flight refresh, then clears the hint (${label})`, async () => {
      vi.stubGlobal("navigator", nav());
      const pending = deferred();
      const mgr = new RefreshTokenManager({
        service: "MAIN",
        refresh: () => pending.promise,
        onRefreshed: markSessionActive,
        onRefreshFailed: () => {},
      });
      const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

      const fresh = mgr.refresh(Date.now());
      await new Promise((r) => setTimeout(r, 0)); // the refresh call is on the wire
      const logout = AuthModel.logout();
      await Promise.resolve();
      expect(post).not.toHaveBeenCalled(); // waits for the rotation to finish

      pending.resolve();
      await fresh;
      await logout;

      expect(post).toHaveBeenCalledTimes(1);
      expect(hasSessionHint()).toBe(false); // not re-marked by the refresh
    });

    it(`logout stops waiting for a hung refresh after 15s (${label})`, async () => {
      vi.useFakeTimers();
      try {
        vi.stubGlobal("navigator", nav());
        const hung = deferred();
        const onRefreshed = vi.fn(markSessionActive);
        const mgr = new RefreshTokenManager({
          service: "MAIN",
          refresh: () => hung.promise,
          onRefreshed,
          onRefreshFailed: () => {},
        });
        const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

        void mgr.refresh(Date.now()).catch(() => {});
        await vi.advanceTimersByTimeAsync(0);
        const logout = AuthModel.logout();

        await vi.advanceTimersByTimeAsync(14_999);
        expect(post).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await logout;
        expect(post).toHaveBeenCalledTimes(1);
        expect(hasSessionHint()).toBe(false);

        // The hung refresh finally lands: the session is not re-marked.
        hung.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(onRefreshed).not.toHaveBeenCalled();
        expect(hasSessionHint()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  }

  it("uses the app-prefixed lock name shared with the refresh", async () => {
    const locks = fakeLocks();
    vi.stubGlobal("navigator", { locks });
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    await AuthModel.logout();
    expect(locks.request).toHaveBeenCalledWith(
      "PRISM_APP:auth-refresh:MAIN",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      expect.any(Function),
    );
  });

  it("no locks: 401s during the logout request never refresh the cookie being revoked", async () => {
    vi.stubGlobal("navigator", {}); // navigator.locks missing
    const refreshCall = vi.spyOn(axios, "post"); // the bare refresh client
    vi.spyOn(AuthModel.api, "post").mockImplementation((async () => {
      await new Promise((r) => setTimeout(r, 30)); // slow server logout
      return { success: true };
    }) as never);
    // Access cookie expired; the hint says a session exists → normally refreshable.
    const client = makeClient(async (config) => httpError(config), {
      MAIN: { endpoint: "/auth/refresh", hasSession: hasSessionHint },
    });

    const logout = AuthModel.logout();
    await new Promise((r) => setTimeout(r, 5)); // logout request in flight
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => client.get("/auth/me")),
    );
    await logout;

    for (const result of results) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        error_code: 401,
        message: "session_ended",
      });
    }
    expect(refreshCall).not.toHaveBeenCalled(); // no /auth/refresh at all
    expect(hasSessionHint()).toBe(false);
  });

  it("voluntary logout never announces session expiry, even when the request fails", async () => {
    vi.stubGlobal("navigator", {});
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 0, message: "Network Error" });
    const ended = vi.fn();
    const unsubscribe = onSessionEnded(ended);

    await expect(AuthModel.logout()).rejects.toMatchObject({ error_code: 0 });
    unsubscribe();

    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(hasSessionHint()).toBe(false);
  });

  it("refreshes work again once logout finished (a new login)", async () => {
    vi.stubGlobal("navigator", {});
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();

    const refresh = vi.fn(async () => {});
    const mgr = new RefreshTokenManager({ service: "MAIN", refresh, onRefreshFailed: () => {} });
    await mgr.refresh(Date.now() + 5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
