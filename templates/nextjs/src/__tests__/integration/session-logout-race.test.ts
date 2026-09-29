import { installFakeLocks } from "@/__tests__/helpers/fake-web-locks";
import { httpError, makeClient } from "@/__tests__/helpers/http-mocks";
import { installLocalStorage } from "@/__tests__/helpers/session-browser";
import { APP_PREFIX } from "@/enums";
import { AuthModel } from "@/services/auth";
import {
  Api,
  endSession,
  hasSessionHint,
  markSessionActive,
  onSessionEnded,
  SESSION_WAIT_TIMEOUT_MS,
} from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import axios from "axios";

/** Logout vs an in-flight (or hung, or locked-elsewhere) refresh. */

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
    vi.useRealTimers();
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
    onTestFinished(off);

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
    onTestFinished(off);
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
  });
});
