import { queryKeys } from "@/services/query-keys";
import { describe, expect, it } from "vitest";

/** Flatten the nested registry into the list of raw key strings. */
function flatten(obj: Record<string, unknown>): string[] {
  return Object.values(obj).flatMap((v) =>
    typeof v === "string" ? [v] : flatten(v as Record<string, unknown>),
  );
}

describe("queryKeys registry", () => {
  it("has no duplicate key strings (the whole point: prevent cache-key collisions)", () => {
    const keys = flatten(queryKeys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the users list and session keys distinct", () => {
    expect(queryKeys.users.list).not.toBe(queryKeys.auth.me);
  });
});
