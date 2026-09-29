import { renderWithI18n } from "@/__tests__/helpers/render-with-i18n";
import { SessionBanner } from "@/components/session-banner";
import { AuthModel, isSessionUnavailable } from "@/services/auth";
import { makeQueryClient } from "@/services/core/query-client";
import { markSessionActive } from "@/services/core/session";
import { QueryObserver } from "@tanstack/react-query";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResponseError } from "@/services/core/types";

/**
 * The session-unavailable banner: shown when restoring the session fails for a
 * transient reason (network, timeout, 5xx), gone once a retry succeeds, and
 * never shown for a 401 (that is the normal signed-out flow).
 */

const USER = { _id: "u1", name: "Demo", email: "demo@example.com", role: "user" };

function mountSession() {
  const queryClient = makeQueryClient();
  const observer = new QueryObserver<unknown, ApiResponseError>(queryClient, {
    queryKey: ["auth.me"],
    queryFn: () => AuthModel.getSession(),
  });
  const off = observer.subscribe(() => {});
  return { observer, unmount: off };
}

const unavailable = () => ({ error_code: 503, message: "down", retryable: true });

describe("session unavailable", () => {
  // A cookie jar with the session hint set: only a session worth restoring can be "unavailable".
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
    markSessionActive();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("an anonymous visitor (no session hint) never sees the banner, even with the backend down", async () => {
    vi.stubGlobal("document", { cookie: "" });
    const get = vi.spyOn(AuthModel.api, "get").mockRejectedValue(unavailable());
    const { observer, unmount } = mountSession();

    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(observer.getCurrentResult().data).toBeNull();
    expect(isSessionUnavailable(observer.getCurrentResult().error)).toBe(false);
    expect(get).not.toHaveBeenCalled();
    unmount();
  });

  it("a transient failure raises the banner condition, and a successful retry clears it", async () => {
    const get = vi.spyOn(AuthModel.api, "get").mockRejectedValueOnce(unavailable());

    const { observer, unmount } = mountSession();

    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    expect(isSessionUnavailable(observer.getCurrentResult().error)).toBe(true);

    get.mockResolvedValueOnce({ data: { user: USER } } as never);
    await observer.refetch();

    expect(observer.getCurrentResult().data).toMatchObject({ _id: "u1" });
    expect(isSessionUnavailable(observer.getCurrentResult().error)).toBe(false);
    unmount();
  });

  it("a 401 resolves signed out with no banner", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue({ error_code: 401, message: "no" });
    const { observer, unmount } = mountSession();

    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(observer.getCurrentResult().data).toBeNull();
    expect(isSessionUnavailable(observer.getCurrentResult().error)).toBe(false);
    unmount();
  });

  it("only retryable errors count", () => {
    expect(isSessionUnavailable(null)).toBe(false);
    expect(isSessionUnavailable({ error_code: 500, message: "x" } as ApiResponseError)).toBe(false);
    expect(isSessionUnavailable(unavailable() as ApiResponseError)).toBe(true);
  });
});

describe("SessionBanner", () => {
  it("renders an alert with the message and a retry button when unavailable", async () => {
    const html = await renderWithI18n(
      createElement(SessionBanner, { unavailable: true, onRetry: () => {} }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not reach the server. You are still signed in.");
    expect(html).toContain("Retry");
  });

  it("renders nothing while the session is fine", async () => {
    const html = await renderWithI18n(
      createElement(SessionBanner, { unavailable: false, onRetry: () => {} }),
    );
    expect(html).toBe("");
  });
});
