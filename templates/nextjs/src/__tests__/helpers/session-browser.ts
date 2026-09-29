import { makeClient } from "@/__tests__/helpers/http-mocks";
import { STORAGE_KEYS } from "@/enums";
import { loginPathWithReturn, onSessionEnded, redirectOnSessionExpired } from "@/services/core";
import { onTestFinished, vi } from "vitest";
import axios from "axios";

/** Browser stand-ins for the session tests (the test environment is Node). */

export const HINT = `${STORAGE_KEYS.SESSION}=1`;
export const UNAUTHORIZED = { status: "error", error_code: 401, message: "Unauthorized" };

export function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Browser globals with capturable `storage` / `focus` / `visibilitychange` listeners. */
export function installBrowser(cookie = "") {
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
 * current path as the return path). Listeners are removed when the test finishes. */
export function observeSessionEnd() {
  const ended = vi.fn();
  const redirected = vi.fn();
  const offEnded = onSessionEnded(ended);
  const offRedirect = redirectOnSessionExpired(() =>
    redirected(loginPathWithReturn("/users?page=2#top")),
  );
  onTestFinished(() => {
    offEnded();
    offRedirect();
  });
  return {
    ended,
    redirected,
  };
}

const CREDENTIAL_PATHS = ["/auth/login", "/auth/register", "/auth/logout"];

/** What the bare refresh client's `axios.post` rejects with. */
export function refreshError(failure: { status?: number; code?: string }) {
  return Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    code: failure.code,
    response: failure.status ? { status: failure.status, data: {} } : undefined,
  });
}

/** A MAIN-service client whose refresh goes through the spied `axios.post`
 * (credential paths skip it), with `window.location.reload` captured. */
export function setupRefreshClient(hasSession: boolean | (() => boolean)) {
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  const post = vi.spyOn(axios, "post");
  const client = (adapter: Parameters<typeof makeClient>[0]) =>
    makeClient(adapter, {
      MAIN: {
        endpoint: "/auth/refresh",
        skipPaths: CREDENTIAL_PATHS,
        hasSession: typeof hasSession === "function" ? hasSession : () => hasSession,
      },
    });
  return { reload, post, client };
}
