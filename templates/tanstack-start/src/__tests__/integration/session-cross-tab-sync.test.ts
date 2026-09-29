import {
  HINT,
  installBrowser,
  installLocalStorage,
  observeSessionEnd,
} from "@/__tests__/helpers/session-browser";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth";
import {
  endSession,
  getSessionEpoch,
  markSessionActive,
  onSessionEnded,
  syncAuthAcrossTabs,
} from "@/services/core";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Cross-tab login/logout sync, and how a tab reacts to a logout made in another tab. */

describe("cross-tab auth sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("session end broadcasts a logout other tabs can observe", () => {
    installBrowser();
    const store = installLocalStorage();
    endSession("logout");
    expect(store.get(STORAGE_KEYS.AUTH_SYNC)).toMatch(/^logout:/);
  });

  it("a logout in another tab ends this tab's session; a login re-reads it", () => {
    const handlers = installBrowser();
    installLocalStorage();
    markSessionActive();
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    const onLogin = vi.fn();
    const onLogout = vi.fn();
    const stop = syncAuthAcrossTabs({ onLogin, onLogout });
    const epoch = getSessionEpoch();

    document.cookie = `${STORAGE_KEYS.SESSION}=; path=/; max-age=0`; // other tab cleared it
    handlers.storage!({ key: STORAGE_KEYS.AUTH_SYNC, newValue: "logout:1" });
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(getSessionEpoch()).toBeGreaterThan(epoch); // in-flight refreshes persist nothing

    handlers.visibilitychange!({}); // same state on focus → no duplicate
    expect(onLogout).toHaveBeenCalledTimes(1);

    handlers.storage!({ key: "unrelated", newValue: "login:2" });
    expect(onLogin).not.toHaveBeenCalled();
    handlers.storage!({ key: STORAGE_KEYS.AUTH_SYNC, newValue: "login:2" });
    expect(onLogin).toHaveBeenCalledTimes(1);
    stop();
    off();
  });

  it("notices a hint-cookie change when the tab becomes visible or regains focus", () => {
    const handlers = installBrowser();
    installLocalStorage();
    const onLogin = vi.fn();
    const onLogout = vi.fn();
    const stop = syncAuthAcrossTabs({ onLogin, onLogout });

    document.cookie = `${STORAGE_KEYS.SESSION}=1`; // another tab signed in
    handlers.visibilitychange!({});
    expect(onLogin).toHaveBeenCalledTimes(1);

    const epoch = getSessionEpoch();
    document.cookie = `${STORAGE_KEYS.SESSION}=`; // …then signed out; this tab regains focus
    handlers.focus!({});
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(getSessionEpoch()).toBe(epoch + 1);
    stop();
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
