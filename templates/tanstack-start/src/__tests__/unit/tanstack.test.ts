import { defineMutation, defineQuery } from "@/services/core";
import { describe, expect, it } from "vitest";

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
    expect(await opts.queryFn()).toEqual([]);
  });

  it("threads params into queryOptions key + fetcher", async () => {
    const opts = useUser.queryOptions(7);
    expect(opts.queryKey).toEqual(["users.detail", 7]);
    expect(await opts.queryFn()).toBe("x");
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
});
