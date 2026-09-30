import { serverQuery } from "@/server/hydrated-queries";
import { usersListServer } from "@/server/queries";
import { defineQuery } from "@/services/core";
import { useUsersListQuery } from "@/services/users";
import { describe, expect, it } from "vitest";

describe("serverQuery", () => {
  const useDetail = defineQuery<string, number>({ key: "items.detail", fetcher: async () => "c" });

  it("takes the key from the definition and runs the server fetcher with params", async () => {
    const detailServer = serverQuery(useDetail, async (id) => `item-${id}`);
    const entry = detailServer(7);
    expect(entry.queryKey).toEqual(useDetail.queryKey(7));
    expect(await entry.queryFn()).toBe("item-7");
  });

  // Runs in the node environment (no `window`): a query module that touches browser APIs at import
  // time would break every Server Component that prefetches it, and fails here first.
  it("pairs the users list with the client query key, importable on the server", () => {
    expect(usersListServer().queryKey).toEqual(useUsersListQuery.queryKey());
  });
});
