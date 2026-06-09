import { Model, Api } from "@/services/core";
import { beforeEach, describe, expect, it } from "vitest";

describe("Model", () => {
  beforeEach(() => {
    Api.setBaseURL("http://main", "MAIN");
  });

  it("setup wires path and service on the subclass", () => {
    class FooModel extends Model {
      static {
        Model.setup.call(this, { path: "/foo" });
      }
    }

    expect(FooModel.path).toBe("/foo");
    expect(FooModel.service).toBe("MAIN");
    expect(FooModel.api).toBeInstanceOf(Api);
  });

  it("setup respects an explicit service override", () => {
    class BarModel extends Model {
      static {
        Model.setup.call(this, { path: "/bar", service: "ADMIN" });
      }
    }

    expect(BarModel.service).toBe("ADMIN");
  });
});
