import { AuthModel, useMeQuery } from "@/services/auth";
import { defineQuery } from "@/services/core";
import { UsersModel, useUsersListQuery } from "@/services/users";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Runs as the Nuxt server bundle does (`import.meta.server = true`, the `ssr`
 * vitest project): a query's `serverFetcher` replaces its browser `fetcher`.
 * Reads are driven through `queryOptions().queryFn`, with the network stubbed at
 * `$fetch` / `useRequestHeaders` (Nuxt auto-imports), so the real server path —
 * cookie forwarding included — runs and the browser Models must stay untouched.
 */

const signal = new AbortController().signal;
const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };
const USERS = { success: true, data: [USER], meta: { page: 1, limit: 10, total: 1 } };

function run<T>(options: { queryFn?: unknown }): Promise<T> {
  return (options.queryFn as (c: unknown) => Promise<T>)({ signal });
}

function stubServer(cookie: string | undefined, fetchImpl: () => Promise<unknown>) {
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appEndpoint: "http://api.test", apiPrefix: "/api/v1" },
  }));
  vi.stubGlobal("useRequestHeaders", () => (cookie ? { cookie } : {}));
  vi.stubGlobal("$fetch", vi.fn(fetchImpl));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("defineQuery on the server", () => {
  it("runs serverFetcher instead of fetcher, with params and the abort signal", async () => {
    const fetcher = vi.fn(async () => "client");
    const serverFetcher = vi.fn(async (id: number) => `server-${id}`);
    const useRead = defineQuery<string, number>({ key: "read", fetcher, serverFetcher });

    await expect(run(useRead.queryOptions(7))).resolves.toBe("server-7");
    expect(serverFetcher).toHaveBeenCalledWith(7, { signal });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to fetcher when no serverFetcher is declared", async () => {
    const useRead = defineQuery<string>({ key: "read", fetcher: async () => "shared" });
    await expect(run(useRead.queryOptions())).resolves.toBe("shared");
  });
});

describe("resource queries on the server", () => {
  it("useUsersListQuery reads through the server API forwarding only the access cookie", async () => {
    const list = vi.spyOn(UsersModel, "list");
    stubServer(
      "PRISM_APP_SESSION=1; refreshToken=r; analytics=a; accessToken=x; PRISM_APP_LANGUAGE=en",
      async () => USERS,
    );

    await expect(run(useUsersListQuery.queryOptions())).resolves.toEqual(USERS);
    expect($fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users"),
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "accessToken=x" }),
      }),
    );
    expect(list).not.toHaveBeenCalled();
  });

  it("sends no cookie header when the access cookie is absent", async () => {
    stubServer("PRISM_APP_SESSION=1; refreshToken=r", async () => USERS);

    await run(useUsersListQuery.queryOptions());
    const init = vi.mocked($fetch).mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers).not.toHaveProperty("cookie");
  });

  it("useMeQuery resolves the user via readServerSession, not the browser Model", async () => {
    const getSession = vi.spyOn(AuthModel, "getSession");
    stubServer("PRISM_APP_SESSION=1", async () => ({ success: true, data: { user: USER } }));

    await expect(run(useMeQuery.queryOptions())).resolves.toEqual(USER);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("useMeQuery without the session hint is anonymous, with no request", async () => {
    stubServer(undefined, async () => ({ success: true, data: { user: USER } }));

    await expect(run(useMeQuery.queryOptions())).resolves.toBeNull();
    expect($fetch).not.toHaveBeenCalled();
  });
});
