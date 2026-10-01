import { getMeServerFn } from "@/server/get-me";
import { isSessionUnavailable, useMeQuery } from "@/services/auth/session";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The session-unavailable banner is driven by the session query's error: shown for a
 * transient failure, cleared by a successful retry, never shown for a plain 401. */

vi.mock("@/server/get-me", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/get-me")>()),
  getMeServerFn: vi.fn(),
}));

const USER = { _id: "1", email: "a@b.co", name: "A", role: "user" };

function observe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return new QueryObserver(client, useMeQuery.queryOptions());
}

describe("session unavailable state", () => {
  const getMe = vi.mocked(getMeServerFn as unknown as () => Promise<unknown>);

  afterEach(() => getMe.mockReset());

  it("a transient failure raises it and a successful retry clears it", async () => {
    getMe.mockRejectedValueOnce({ status: "error", error_code: 503, retryable: true });
    const observer = observe();

    const failed = await observer.refetch();
    expect(isSessionUnavailable(failed.error)).toBe(true);

    getMe.mockResolvedValueOnce(USER);
    const retried = await observer.refetch();
    expect(isSessionUnavailable(retried.error)).toBe(false);
    expect(retried.data).toEqual(USER);
  });

  it("a 404 from the session read resolves to signed out as well", async () => {
    getMe.mockRejectedValue({ status: "error", error_code: 404 });

    const result = await observe().refetch();

    expect(result.data).toBeNull();
    expect(isSessionUnavailable(result.error)).toBe(false);
  });

  it("a 401 resolves to signed out without raising it", async () => {
    getMe.mockResolvedValue({ unauthorized: true, hasSession: false });

    const result = await observe().refetch();

    expect(result.data).toBeNull();
    expect(isSessionUnavailable(result.error)).toBe(false);
  });
});
