import {
  HINT,
  installBrowser,
  installLocalStorage,
  observeSessionEnd,
  UNAUTHORIZED,
} from "@/__tests__/helpers/session-browser";
import { AuthModel } from "@/services/auth";
import { Api, bumpSessionEpoch, endSession, RefreshTokenManager } from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two ways a session ends from this tab — the user's logout ("logout", no
 * return path) and a server-rejected live session ("expired", revoked, with a
 * return path).
 */

/** A refresh of the main session that stays in flight until settled by hand. */
function startHeldRefresh() {
  const settle = { resolve: () => {}, reject: (_error: unknown) => {} };
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        settle.resolve = resolve;
        settle.reject = reject;
      }),
  );
  const manager = new RefreshTokenManager({
    service: "MAIN",
    refresh,
    onRefreshFailed: () => endSession("expired"),
  });
  const done = manager.refresh().catch(() => {});
  return { refresh, settle, done };
}

describe("revoking a server-rejected session", () => {
  beforeEach(() => {
    Api.setBaseURL("http://api.test", "MAIN");
    installBrowser(HINT);
    installLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a boot 401 with a live session revokes it and ends it as expired with a return path", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const { ended, redirected } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: "/auth/logout" }));
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(redirected).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2%23top");
    expect(document.cookie).not.toContain(HINT);
  });

  it("a revoke whose logout request fails still ends the session", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 0, message: "offline" });
    const { ended } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
  });

  it("a boot 401 after the session already ended does not post logout", async () => {
    // The session ends (e.g. a refused refresh) while the read is in flight.
    vi.spyOn(AuthModel.api, "get").mockImplementation(async () => {
      endSession("expired");
      throw UNAUTHORIZED;
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const { ended } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1); // only the original end
    await expect(AuthModel.revokeSession()).resolves.toBe(false); // hint already gone
  });

  it("an anonymous 401 (no session hint) does not post logout or end a session", async () => {
    document.cookie = "";
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi.spyOn(AuthModel.api, "post");
    const { ended } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it("concurrent revokes post logout once", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 10)) as never,
      );
    const { ended } = observeSessionEnd();

    const [, , revoked] = await Promise.all([
      AuthModel.getSession(),
      AuthModel.getSession(),
      AuthModel.revokeSession(),
    ]);
    expect(revoked).toBe(true); // joined the in-flight revoke
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("a logout during an in-flight revoke posts once and ends the session once", async () => {
    let answer!: (value: unknown) => void;

    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)) as never);
    const { ended } = observeSessionEnd();

    const read = AuthModel.getSession();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1)); // revoke in flight
    const logout = AuthModel.logout();
    answer({ success: true });
    await Promise.all([logout, read]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
  });

  it("a revoke waiting for the lock does nothing when a refused refresh ends the session first", async () => {
    const post = vi.spyOn(AuthModel.api, "post");

    const { ended } = observeSessionEnd();
    const { settle, done, refresh } = startHeldRefresh();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled()); // refresh holds the lock

    const revoked = AuthModel.revokeSession();
    settle.reject({ response: { status: 401 } }); // refused: the session ends as expired
    await done;

    await expect(revoked).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
  });

  it("a logout joining a revoke that backs out still signs out", async () => {
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    const { ended, redirected } = observeSessionEnd();
    const { settle, done, refresh } = startHeldRefresh();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled()); // refresh holds the lock

    const revoked = AuthModel.revokeSession();
    const logout = AuthModel.logout(); // joins the revoke
    bumpSessionEpoch(); // the epoch moves while the revoke waits: it is stale
    settle.resolve();
    await done;

    await expect(revoked).resolves.toBe(false);
    await logout;
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(redirected).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain(HINT);
  });

  it("without Web Locks, a logout joining a revoke that backs out still signs out", async () => {
    vi.stubGlobal("navigator", {}); // the revoke waits on this tab's in-flight refresh instead
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    const { ended, redirected } = observeSessionEnd();
    const { settle, done, refresh } = startHeldRefresh();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled()); // refresh holds the lock

    const revoked = AuthModel.revokeSession();
    const logout = AuthModel.logout(); // joins the revoke
    bumpSessionEpoch(); // the epoch moves while the revoke waits: it is stale
    settle.resolve();
    await done;

    await expect(revoked).resolves.toBe(false);
    await logout;
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(redirected).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain(HINT);
  });

  it("a voluntary logout ends as logout without a return path", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const { ended, redirected } = observeSessionEnd();

    await AuthModel.logout();
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(redirected).not.toHaveBeenCalled();
  });
});
