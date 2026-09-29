import {
  HINT,
  installBrowser,
  installLocalStorage,
  observeSessionEnd,
} from "@/__tests__/helpers/session-browser";
import { getMeServerFn } from "@/server/get-me";
import { AuthModel } from "@/services/auth";
import { fetchSession } from "@/services/auth/session";
import { registerSessionRefresher } from "@/services/core";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The session query fetcher reads through a server function; a session still
 * rejected in the browser is revoked, a server-side read never revokes. */

vi.mock("@/server/get-me", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/get-me")>()),
  getMeServerFn: vi.fn(),
}));

const UNAUTHORIZED_HINTED = { unauthorized: true, hasSession: true } as const;

describe("the session query fetcher (server function read)", () => {
  const getMe = vi.mocked(getMeServerFn as unknown as () => Promise<unknown>);

  afterEach(() => {
    getMe.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("in the browser, a session still rejected after a refresh is revoked and ends as expired", async () => {
    installBrowser(HINT);
    installLocalStorage();
    registerSessionRefresher(vi.fn().mockResolvedValue(undefined)); // refresh succeeds…
    getMe.mockResolvedValue(UNAUTHORIZED_HINTED); // …but the read still 401s
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const { ended, redirected } = observeSessionEnd();

    await expect(fetchSession()).resolves.toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(redirected).toHaveBeenCalledTimes(1);
  });

  it("no hint in the browser → no request → null", async () => {
    installBrowser(""); // anonymous or logged out: no session hint cookie
    installLocalStorage();

    await expect(fetchSession()).resolves.toBeNull();
    expect(getMe).not.toHaveBeenCalled();
  });

  it("the server-side read never revokes", async () => {
    getMe.mockResolvedValue({ unauthorized: true, hasSession: false });
    const post = vi.spyOn(AuthModel.api, "post");

    await expect(fetchSession()).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
