import { getRouter } from "@/router";
import { describe, expect, it } from "vitest";

/** An unmatched URL renders inside the layout: the root route owns a not-found component. */
describe("not-found route", () => {
  it("the root route registers a notFoundComponent", () => {
    expect(getRouter().routeTree.options.notFoundComponent).toBeTypeOf("function");
  });
});
