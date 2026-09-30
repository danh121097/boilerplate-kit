import { defineQuery, ensureQueries, prefetchQueries } from "@/services/core";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

const ctx = (client: QueryClient) => ({ context: { queryClient: client } });

describe("prefetchQueries / ensureQueries", () => {
  const useUser = defineQuery<string, number>({
    key: "users.detail",
    fetcher: async (id) => `u${id}`,
  });
  const useBroken = defineQuery<string>({
    key: "broken",
    fetcher: async () => {
      throw new Error("boom");
    },
  });

  it("prefetches a parameterized definition via [definition, params]", async () => {
    const client = new QueryClient();
    await prefetchQueries([useUser, 7])(ctx(client));
    expect(client.getQueryData(useUser.queryKey(7))).toBe("u7");
  });

  it("prefetchQueries swallows a failing fetch", async () => {
    await expect(prefetchQueries(useBroken)(ctx(new QueryClient()))).resolves.toBeUndefined();
  });

  it("ensureQueries rejects on a failing fetch", async () => {
    await expect(ensureQueries(useBroken)(ctx(new QueryClient()))).rejects.toThrow("boom");
  });
});
