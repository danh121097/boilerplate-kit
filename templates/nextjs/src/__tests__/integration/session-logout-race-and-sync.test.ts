import { installFakeLocks } from "@/__tests__/helpers/fake-web-locks";
import { httpError, makeClient } from "@/__tests__/helpers/http-mocks";
import { APP_PREFIX, STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth";
import {
  Api,
  endSession,
  getSessionEpoch,
  hasSessionHint,
  loginPathWithReturn,
  markSessionActive,
  onSessionEnded,
  safeRedirect,
  SESSION_WAIT_TIMEOUT_MS,
  syncAuthAcrossTabs,
} from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * Logout vs an in-flight refresh, cross-tab login/logout sync, and the
 * same-origin return path used after a session expires.
 */

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Browser globals with capturable `storage` / `visibilitychange` listeners. */
function installBrowser() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const listen = (type: string, fn: (event: unknown) => void) => {
    handlers[type] = fn;
  };
  const doc = { cookie: "", visibilityState: "visible", addEventListener: listen };
  vi.stubGlobal("window", { addEventListener: listen, removeEventListener: vi.fn() });
  vi.stubGlobal("document", { ...doc, removeEventListener: vi.fn() });
  return handlers;
}

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("logout during an in-flight refresh", () => {
  beforeEach(() => {
    Api.setBaseURL("http://api.test", "MAIN");
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for the in-flight refresh, then revokes; nothing is written back afterwards", async () => {
    const lockRequest = installFakeLocks();
    installLocalStorage();
    markSessionActive();

    const events: string[] = [];
    const refreshCall = deferred();
    vi.spyOn(axios, "post").mockImplementation(async () => {
      await refreshCall.promise;
      events.push("refresh-done");
      return { data: { success: true } };
    });
    vi.spyOn(AuthModel.api, "post").mockImplementation(async () => {
      events.push("logout");
      return { success: true } as never;
    });
    const ended = vi.fn();
    const off = onSessionEnded(ended);

    const http = makeClient(async (config) => httpError(config, 401), {
      MAIN: { endpoint: "/auth/refresh", skipPaths: ["/auth/logout"], hasSession: hasSessionHint },
    });
    const pending = http.get("/users").catch((e: unknown) => e);
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1)); // refresh in flight

    const logout = AuthModel.logout();
    refreshCall.resolve(); // the refresh resolves AFTER logout started
    await logout;
    await pending;

    // Logout revoked the cookie the refresh rotated, and nothing re-marked the session.
    expect(events).toEqual(["refresh-done", "logout"]);
    expect(hasSessionHint()).toBe(false);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("logout", "MAIN"); // never "expired"
    // Refresh and logout share one app-prefixed lock.
    const lockNames = lockRequest.mock.calls.map(([name]) => name);
    expect(new Set(lockNames)).toEqual(new Set([`${APP_PREFIX}:auth-refresh:MAIN`]));
    off();
  });

  it("without Web Locks: 401s during a slow logout reject and never call /auth/refresh", async () => {
    vi.stubGlobal("navigator", {});
    installLocalStorage();
    markSessionActive();
    const refresh = vi.spyOn(axios, "post");
    const logoutCall = deferred();
    vi.spyOn(AuthModel.api, "post").mockImplementation(async () => {
      await logoutCall.promise;
      return { success: true } as never;
    });

    const http = makeClient(async (config) => httpError(config, 401), {
      MAIN: { endpoint: "/auth/refresh", skipPaths: ["/auth/logout"], hasSession: hasSessionHint },
    });
    const logout = AuthModel.logout();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => http.get("/users").catch((e: unknown) => e)),
    );
    logoutCall.resolve();
    await logout;

    for (const result of results) {
      expect(result).toMatchObject({ error_code: 401, message: "session_ended" });
    }
    expect(refresh).not.toHaveBeenCalled();
  });

  it("logout stops waiting for a hung refresh after 15s and still revokes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {});
    installLocalStorage();
    markSessionActive();
    const hung = deferred();
    vi.spyOn(axios, "post").mockImplementation(async () => {
      await hung.promise; // settles only after the assertions
      return { data: { success: true } };
    });
    const logoutPost = vi
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true } as never);
    const http = makeClient(async (config) => httpError(config, 401), {
      MAIN: { endpoint: "/auth/refresh", skipPaths: ["/auth/logout"], hasSession: hasSessionHint },
    });
    void http.get("/users").catch(() => {});
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1)); // refresh hung

    const logout = AuthModel.logout();
    await vi.advanceTimersByTimeAsync(SESSION_WAIT_TIMEOUT_MS - 1);
    expect(logoutPost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(logoutPost).toHaveBeenCalledTimes(1);
    expect(hasSessionHint()).toBe(false);
    hung.resolve();
    vi.useRealTimers();
  });

  it("logout proceeds without the lock when another tab holds it past 15s", async () => {
    vi.useFakeTimers();
    installFakeLocks();
    installLocalStorage();
    markSessionActive();
    const logoutPost = vi
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true } as never);
    // Another tab holds the refresh lock and never lets go.
    void navigator.locks.request(`${APP_PREFIX}:auth-refresh:MAIN`, () => new Promise(() => {}));

    const logout = AuthModel.logout();
    await vi.advanceTimersByTimeAsync(SESSION_WAIT_TIMEOUT_MS);
    await logout;

    expect(logoutPost).toHaveBeenCalledTimes(1);
    expect(hasSessionHint()).toBe(false);
    vi.useRealTimers();
  });

  it("a refresh that resolves after the session ended writes back no hint", async () => {
    installLocalStorage();
    markSessionActive();
    const refreshCall = deferred();
    vi.spyOn(axios, "post").mockImplementation(async () => {
      await refreshCall.promise;
      return { data: { success: true } };
    });
    const http = makeClient(async (config) => httpError(config, 401), {
      MAIN: { endpoint: "/auth/refresh", hasSession: hasSessionHint },
    });

    const pending = http.get("/users").catch((e: unknown) => e);
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    endSession("logout"); // e.g. a logout observed from another tab
    refreshCall.resolve();

    expect(await pending).toMatchObject({ error_code: 401, message: "session_ended" });
    expect(hasSessionHint()).toBe(false);
  });

  it("a refresh refused after the session ended fires no session-expired", async () => {
    installLocalStorage();
    markSessionActive();
    const refreshCall = deferred();
    vi.spyOn(axios, "post").mockImplementation(async () => {
      await refreshCall.promise;
      throw Object.assign(new Error("refused"), { response: { status: 401, data: {} } });
    });
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    const http = makeClient(async (config) => httpError(config, 401), {
      MAIN: { endpoint: "/auth/refresh", hasSession: hasSessionHint },
    });

    const pending = http.get("/users").catch((e: unknown) => e);
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    endSession("logout");
    refreshCall.resolve();

    expect(await pending).toMatchObject({ error_code: 401, message: "session_ended" });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    off();
  });
});

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

describe("return path after session expiry", () => {
  it("login path carries the current path", () => {
    expect(loginPathWithReturn("/users?page=2")).toBe("/login?redirect=%2Fusers%3Fpage%3D2");
  });

  it.each([
    ["/users?page=2", "/users?page=2"],
    ["/", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/users\\x", "/"],
    ["https://evil.example", "/"],
    ["/r?next=https://evil.example", "/"],
    ["users", "/"],
    ["/\t/evil.example", "/"],
    ["/\n/evil.example", "/"],
    ["/ok\u007F", "/"],
    ["/login", "/"],
    ["/login/", "/"],
    ["/login?redirect=%2Fusers", "/"],
    ["/login-help", "/login-help"],
    [null, "/"],
  ])("safeRedirect(%j) → %j", (value, expected) => {
    expect(safeRedirect(value)).toBe(expected);
  });

  it("safeRedirect accepts up to 512 characters and rejects longer values", () => {
    const max = `/${"a".repeat(511)}`;
    expect(safeRedirect(max)).toBe(max);
    expect(safeRedirect(`${max}a`)).toBe("/");
  });
});
