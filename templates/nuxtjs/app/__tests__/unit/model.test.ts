import { Api, Model } from "@/services/core";
import { describe, expect, it } from "vitest";

class FooModel extends Model {
  static {
    Model.setup.call(this, { path: "/foo" });
  }
}

class BarModel extends Model {
  static {
    Model.setup.call(this, { path: "/bar", service: "ADMIN" });
  }
}

describe("Model.setup", () => {
  it("wires path, service and an Api instance onto the subclass", () => {
    expect(FooModel.path).toBe("/foo");
    expect(FooModel.service).toBe("MAIN"); // default
    expect(FooModel.api).toBeInstanceOf(Api);
  });

  it("honors an explicit service", () => {
    expect(BarModel.service).toBe("ADMIN");
    expect(BarModel.path).toBe("/bar");
  });

  it("isolates configuration between subclasses", () => {
    expect(FooModel.service).toBe("MAIN");
    expect(FooModel.path).toBe("/foo");
    expect(FooModel.api).not.toBe(BarModel.api);
  });
});
