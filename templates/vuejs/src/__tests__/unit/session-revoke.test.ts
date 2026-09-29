import { deferred, fakeLocks } from "@/__tests__/helpers/fake-locks";
import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { loadAuthStore, makeRouter } from "@/__tests__/helpers/session-harness";
import { AuthModel } from "@/services/auth/auth";
import {
  bumpSessionEpoch,
  clearServiceTokens,
  endSession,
  getAccessToken,
  getRefreshToken,
  getSessionEpoch,
  isLogoutPending,
  onSessionEnded,
  persistAccessToken,
  persistRefreshToken,
  refreshLockName,
} from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";

/**
 * Revoking a server-rejected session: it is revoked once and ends as
 * "expired" (the login redirect keeps a return path) — unless it already
 * ended, before the call or while it waited for the refresh lock, in which
 * case nothing is posted. A logout arriving meanwhile joins the revoke.
 */
type Store = Awaited<ReturnType<typeof loadAuthStore>>;
let useAuthStore: Store["useAuthStore"];
let setupSessionExpiry: Store["setupSessionExpiry"];

const unauthorized = { error_code: 401, message: "expired" };

describe("revoking a rejected session", () => {
  const stops: Array<() => void> = [];

  const watchEnds = () => {
    const ended = vi.fn();
    stops.push(onSessionEnded(ended));
    return ended;
  };

  beforeAll(async () => {
    ({ useAuthStore, setupSessionExpiry } = await loadAuthStore());
  });

  beforeEach(() => {
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a boot 401 with a live session revokes it and ends it as expired with a return path", async () => {
    const activePinia = pinia.createPinia();
    const { router, replace } = makeRouter({
      name: "users",
      fullPath: "/users?page=2",
      requiresAuth: true,
    });
    setupSessionExpiry(router, activePinia);
    vi.spyOn(AuthModel, "getMe").mockRejectedValue(unauthorized);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();
    const store = useAuthStore(activePinia);

    await store.hydrate();

    expect(post).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url: "/auth/logout", data: { refreshToken: "RT" } }),
    );
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    expect(replace).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
    expect(getAccessToken("MAIN")).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it("a boot 401 after the session already ended does not post logout", async () => {
    vi.spyOn(AuthModel, "getMe").mockImplementation(async () => {
      // A refused refresh ended the session while the profile request ran.
      clearServiceTokens("MAIN");
      endSession("expired", "MAIN");
      throw unauthorized;
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = watchEnds();
    const store = useAuthStore();

    await store.hydrate();

    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN"); // the refresh's, only
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(store.hydrateError).toBeNull();
  });

  it("a session read 401 after a successful refresh revokes the session", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue(unauthorized);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();

    await expect(AuthModel.getSession()).resolves.toBeNull();

    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("concurrent revokes post logout once", async () => {
    let finish!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        (() => new Promise((resolve) => (finish = () => resolve({ success: true })))) as never,
      );
    const ended = watchEnds();

    const first = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    const second = AuthModel.revokeSession();
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("revoking a session that already ended resolves false and posts nothing", async () => {
    const post = vi.spyOn(AuthModel.api, "post");
    const sinceEpoch = getSessionEpoch("MAIN");
    endSession("expired", "MAIN"); // e.g. a refused refresh meanwhile

    await expect(AuthModel.revokeSession(sinceEpoch)).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("a revoke of a session that already ended takes no lock and posts nothing", async () => {
    const locks = fakeLocks();
    const request = vi.spyOn(locks, "request");
    vi.stubGlobal("navigator", { locks });
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = watchEnds();
    clearServiceTokens("MAIN"); // no stored session left to revoke

    const revoke = AuthModel.revokeSession();
    expect(isLogoutPending("MAIN")).toBe(false);

    await expect(revoke).resolves.toBe(false);
    expect(isLogoutPending("MAIN")).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it("a logout during an in-flight revoke posts once and ends the session once", async () => {
    let finish!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        (() => new Promise((resolve) => (finish = () => resolve({ success: true })))) as never,
      );
    const ended = watchEnds();

    const revoke = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    const logout = AuthModel.logout();
    finish();

    await expect(revoke).resolves.toBe(true);
    await expect(logout).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("a revoke whose request fails still ends the session and resolves true", async () => {
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 0, message: "Network Error" });
    const ended = watchEnds();

    await expect(AuthModel.revokeSession(getSessionEpoch("MAIN"))).resolves.toBe(true);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    expect(getAccessToken("MAIN")).toBeNull();
  });

  it("a logout joining a revoke that backs out still signs out", async () => {
    const locks = fakeLocks();
    vi.stubGlobal("navigator", { locks });
    const holder = deferred<void>();
    void locks.request(refreshLockName("MAIN"), () => holder.promise);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();

    const revoke = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    const logout = AuthModel.logout();
    bumpSessionEpoch("MAIN"); // the revoke's view of the session is stale now
    holder.resolve();

    await expect(revoke).resolves.toBe(false);
    await logout;
    expect(post).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url: "/auth/logout", data: { refreshToken: "RT" } }),
    );
    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  it("a revoke waiting for the lock does nothing when a refused refresh ends the session first", async () => {
    const locks = fakeLocks();
    vi.stubGlobal("navigator", { locks });
    const holder = deferred<void>();
    void locks.request(refreshLockName("MAIN"), () => holder.promise);
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = watchEnds();

    const revoke = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    // The refresh holding the lock is refused: it clears the tokens and ends
    // the session before the revoke gets the lock.
    clearServiceTokens("MAIN");
    endSession("expired", "MAIN");
    holder.resolve();

    await expect(revoke).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });
});
