import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth";
import {
  Api,
  endSession,
  getSessionEpoch,
  loginPathWithReturn,
  onSessionEnded,
  redirectOnSessionExpired,
  syncAuthAcrossTabs,
} from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two ways a session ends from this tab — the user's logout ("logout", no
 * return path) and a server-rejected live session ("expired", revoked, with a
 * return path) — and how a tab reacts to a logout made in another tab.
 */

const UNAUTHORIZED = { status: "error", error_code: 401, message: "Unauthorized" };
const HINT = `${STORAGE_KEYS.SESSION}=1`;

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Browser globals with capturable `storage` / `focus` / `visibilitychange` listeners. */
function installBrowser(cookie = "") {
  const handlers: Record<string, (event: unknown) => void> = {};
  const listen = (type: string, fn: (event: unknown) => void) => {
    handlers[type] = fn;
  };
  vi.stubGlobal("window", { addEventListener: listen, removeEventListener: vi.fn() });
  vi.stubGlobal("document", {
    cookie,
    visibilityState: "visible",
    addEventListener: listen,
    removeEventListener: vi.fn(),
  });
  return handlers;
}

/** Record session-end events and expiry redirects (the app's redirect adds the
 * current path as the return path). */
function observeSessionEnd() {
  const ended = vi.fn();
  const redirected = vi.fn();
  const offEnded = onSessionEnded(ended);
  const offRedirect = redirectOnSessionExpired(() =>
    redirected(loginPathWithReturn("/users?page=2#top")),
  );
  return {
    ended,
    redirected,
    off: () => {
      offEnded();
      offRedirect();
    },
  };
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
    const { ended, redirected, off } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: "/auth/logout" }));
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(redirected).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2%23top");
    expect(document.cookie).not.toContain(HINT);
    off();
  });

  it("a revoke whose logout request fails still ends the session", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 0, message: "offline" });
    const { ended, off } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    off();
  });

  it("a boot 401 after the session already ended does not post logout", async () => {
    // The session ends (e.g. a refused refresh) while the read is in flight.
    vi.spyOn(AuthModel.api, "get").mockImplementation(async () => {
      endSession("expired");
      throw UNAUTHORIZED;
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const { ended, off } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1); // only the original end
    await expect(AuthModel.revokeSession()).resolves.toBe(false); // hint already gone
    off();
  });

  it("an anonymous 401 (no session hint) does not post logout or end a session", async () => {
    document.cookie = "";
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi.spyOn(AuthModel.api, "post");
    const { ended, off } = observeSessionEnd();

    await expect(AuthModel.getSession()).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
    off();
  });

  it("concurrent revokes post logout once", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 10)) as never,
      );
    const { ended, off } = observeSessionEnd();

    const [, , revoked] = await Promise.all([
      AuthModel.getSession(),
      AuthModel.getSession(),
      AuthModel.revokeSession(),
    ]);
    expect(revoked).toBe(true); // joined the in-flight revoke
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    off();
  });

  it("a logout during an in-flight revoke posts once and ends the session once", async () => {
    let answer!: (value: unknown) => void;

    vi.spyOn(AuthModel.api, "get").mockRejectedValue(UNAUTHORIZED);
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)) as never);
    const { ended, off } = observeSessionEnd();

    const read = AuthModel.getSession();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1)); // revoke in flight
    const logout = AuthModel.logout();
    answer({ success: true });
    await Promise.all([logout, read]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    off();
  });

  it("a voluntary logout ends as logout without a return path", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const { ended, redirected, off } = observeSessionEnd();

    await AuthModel.logout();
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(redirected).not.toHaveBeenCalled();
    off();
  });
});

describe("a logout made in another tab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a remote logout does not clear the session hint or re-broadcast", () => {
    const handlers = installBrowser(HINT);
    const store = installLocalStorage();
    const post = vi.spyOn(AuthModel.api, "post");
    const epoch = getSessionEpoch();

    const onLogout = vi.fn();
    const stop = syncAuthAcrossTabs({ onLogout });

    const { ended, redirected, off } = observeSessionEnd();

    handlers.storage!({ key: STORAGE_KEYS.AUTH_SYNC, newValue: "logout:1" });

    expect(document.cookie).toBe(HINT); // untouched: the other tab owns the write
    expect(store.has(STORAGE_KEYS.AUTH_SYNC)).toBe(false); // no re-broadcast
    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(redirected).not.toHaveBeenCalled(); // no return path
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(getSessionEpoch()).toBe(epoch + 1);

    // The shared cookie jar now shows the other tab's cleared hint: the focus
    // re-check sees the same logout and fires nothing more.
    document.cookie = "";
    handlers.focus!({});
    handlers.storage!({ key: STORAGE_KEYS.AUTH_SYNC, newValue: "logout:1" });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
    stop();
    off();
  });
});
