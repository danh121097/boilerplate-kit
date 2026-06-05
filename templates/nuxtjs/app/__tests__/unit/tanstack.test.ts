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
});

describe("defineMutation", () => {
  const useUpdate = defineMutation<string, number>({ key: "users.update", mutator: async () => "ok" });

  it("exposes the key", () => {
    expect(useUpdate.key).toBe("users.update");
  });
});
