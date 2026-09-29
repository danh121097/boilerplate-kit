import { Route as rootRoute } from "@/routes/__root";
import { describe, expect, it, vi } from "vitest";

/** The root route renders a not-found page for any unmatched URL. */

// The auth store reads localStorage at import time.
vi.hoisted(() => {
  Object.assign(globalThis, {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
});

describe("not-found route", () => {
  it("the root route registers a notFoundComponent", () => {
    expect(rootRoute.options.notFoundComponent).toBeTypeOf("function");
  });
});
