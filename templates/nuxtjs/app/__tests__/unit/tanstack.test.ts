import { defineMutation, defineQuery } from "@/services/core";
import { QueryClient } from "@tanstack/vue-query";
import { describe, expect, it, vi } from "vitest";

const signal = new AbortController().signal;

describe("defineQuery", () => {
  const useUsers = defineQuery<string[]>({ key: "users.list", fetcher: async () => [] });
  const useUser = defineQuery<string, number>({ key: "users.detail", fetcher: async () => "x" });

  it("exposes the key", () => {
    expect(useUsers.key).toBe("users.list");
  });

  it("builds a param-less query key", () => {
    expect(useUsers.queryKey()).toEqual(["users.list"]);
  });

  it("builds a parameterized query key", () => {
    expect(useUser.queryKey(7)).toEqual(["users.detail", 7]);
  });

  it("exposes queryOptions for route-loader prefetch (ensureQueryData)", async () => {
    const opts = useUsers.queryOptions();
    expect(opts.queryKey).toEqual(["users.list"]);
    expect(await (opts.queryFn as (c: unknown) => Promise<unknown>)({ signal })).toEqual([]);
  });

  it("threads params into queryOptions key + fetcher", async () => {
    const opts = useUser.queryOptions(7);
    expect(opts.queryKey).toEqual(["users.detail", 7]);
    expect(await (opts.queryFn as (c: unknown) => Promise<unknown>)({ signal })).toBe("x");
  });

  it("keeps definition-level options in queryOptions and hands the abort signal to the fetcher", async () => {
    const fetcher = vi.fn(async () => "v");
    const useTimed = defineQuery<string>({ key: "timed", staleTime: 5 * 60_000, fetcher });
    const opts = useTimed.queryOptions();
    expect(opts.staleTime).toBe(5 * 60_000);
    await (opts.queryFn as (c: unknown) => Promise<unknown>)({ signal });
    expect(fetcher).toHaveBeenCalledWith(undefined, { signal });
  });
});

describe("defineQuery serverFetcher", () => {
  // `isServerRender` is false outside a Nuxt server render (browser, SPA, unit tests): `fetcher` runs.
  it("runs the browser fetcher outside SSR", async () => {
    const fetcher = vi.fn(async () => "client");
    const serverFetcher = vi.fn(async () => "server");
    const useRead = defineQuery<string>({ key: "read", fetcher, serverFetcher });
    const opts = useRead.queryOptions();
    expect(await (opts.queryFn as (c: unknown) => Promise<unknown>)({ signal })).toBe("client");
    expect(serverFetcher).not.toHaveBeenCalled();
  });
});

describe("defineMutation", () => {
  const useUpdate = defineMutation<string, number>({
    key: "users.update",
    mutator: async () => "ok",
  });

  it("exposes the key", () => {
    expect(useUpdate.key).toBe("users.update");
  });

  it("runs definition and override callbacks, invalidating first", async () => {
    const order: string[] = [];
    const client = new QueryClient();
    vi.spyOn(client, "invalidateQueries").mockImplementation(async () => {
      order.push("invalidate");
    });
    const useDelete = defineMutation<string, number>({
      key: "users.delete",
      mutator: async () => "ok",
      invalidates: ["users.list", ["users.detail", 1]],
      options: {
        onSuccess: () => void order.push("base"),
        onError: () => void order.push("base-error"),
      },
    });
    const opts = useDelete.mutationOptions({
      onSuccess: () => void order.push("override"),
      onError: () => void order.push("override-error"),
    });
    const mctx = { client, meta: undefined } as never;

    await opts.onSuccess?.("ok", 1, undefined as never, mctx);
    await opts.onError?.(new Error("x") as never, 1, undefined as never, mctx);

    expect(order).toEqual([
      "invalidate",
      "invalidate",
      "base",
      "override",
      "base-error",
      "override-error",
    ]);
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["users.list"] });
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["users.detail", 1] });
  });
});

describe("defineMutation optimistic", () => {
  const mctx = (client: QueryClient) => ({ client, meta: undefined }) as never;
  const define = () =>
    defineMutation<string, number>({
      key: "items.rename",
      mutator: async () => "ok",
      invalidates: ["items.list"],
      optimistic: { queryKey: "items.list", update: (old: string[], n) => [...old, `new${n}`] },
    });

  it("edits the cache on mutate and restores the snapshot on error", async () => {
    const client = new QueryClient();
    client.setQueryData(["items.list"], ["a"]);
    const opts = define().mutationOptions();

    const result = await opts.onMutate?.(1, mctx(client));
    expect(client.getQueryData(["items.list"])).toEqual(["a", "new1"]);

    await opts.onError?.(new Error("x") as never, 1, result as never, mctx(client));
    expect(client.getQueryData(["items.list"])).toEqual(["a"]);
  });

  it("defers invalidation to settle and skips a query with no data", async () => {
    const client = new QueryClient();
    const opts = define().mutationOptions();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    const result = await opts.onMutate?.(1, mctx(client));
    expect(client.getQueryData(["items.list"])).toBeUndefined();

    await opts.onSuccess?.("ok", 1, result as never, mctx(client));
    expect(client.invalidateQueries).not.toHaveBeenCalled();
    await opts.onSettled?.("ok", null, 1, result as never, mctx(client));
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["items.list"] });
  });
});
