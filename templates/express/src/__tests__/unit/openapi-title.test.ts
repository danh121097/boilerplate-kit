import { config } from "@/config/environment";
import { createOpenApiDocument } from "@/docs/openapi";
import { afterEach, describe, expect, it } from "vitest";

describe("OpenAPI document title", () => {
  const original = config.appName;
  afterEach(() => {
    config.appName = original;
  });

  it("uses APP_NAME when set and falls back to the default title", () => {
    config.appName = "Acme API";
    expect((createOpenApiDocument([]).info as { title: string }).title).toBe("Acme API");

    config.appName = "";
    expect((createOpenApiDocument([]).info as { title: string }).title).toBe("Express Starter API");
  });
});
