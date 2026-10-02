import { parseEnvironmentFlags } from "@/config/env-validation";
import { describe, expect, it } from "vitest";

describe("parseEnvironmentFlags", () => {
  it("applies defaults when nothing is set", () => {
    expect(parseEnvironmentFlags({})).toEqual({
      nodeEnv: "development",
      port: 3000,
      enableCsrf: false,
      redisEnabled: false,
      docsEnabled: undefined,
      authTokensInBody: true,
    });
  });

  it("treats empty values as unset", () => {
    expect(
      parseEnvironmentFlags({
        PORT: "",
        ENABLE_CSRF: "",
        REDIS_ENABLED: "",
        DOCS_ENABLED: "",
        AUTH_TOKENS_IN_BODY: "",
      }),
    ).toMatchObject({
      port: 3000,
      enableCsrf: false,
      redisEnabled: false,
      docsEnabled: undefined,
      authTokensInBody: true,
    });
  });

  it("parses valid values", () => {
    expect(
      parseEnvironmentFlags({
        NODE_ENV: "production",
        PORT: "8080",
        ENABLE_CSRF: "true",
        REDIS_ENABLED: "true",
        DOCS_ENABLED: "false",
        AUTH_TOKENS_IN_BODY: "false",
      }),
    ).toEqual({
      nodeEnv: "production",
      port: 8080,
      enableCsrf: true,
      redisEnabled: true,
      docsEnabled: false,
      authTokensInBody: false,
    });
  });

  it.each([
    ["ENABLE_CSRF", "True"],
    ["ENABLE_CSRF", "1"],
    ["REDIS_ENABLED", "yes"],
    ["DOCS_ENABLED", "on"],
    ["AUTH_TOKENS_IN_BODY", "0"],
    ["NODE_ENV", "prod"],
    ["PORT", "abc"],
    ["PORT", "0"],
    ["PORT", "-1"],
    ["PORT", "80.5"],
  ])("rejects %s=%s at boot", (key, value) => {
    expect(() => parseEnvironmentFlags({ [key]: value })).toThrow(
      new RegExp(`Invalid environment configuration:.*${key}`),
    );
  });

  it("reports every invalid variable in one error", () => {
    expect(() => parseEnvironmentFlags({ PORT: "abc", ENABLE_CSRF: "1" })).toThrow(
      /PORT.*ENABLE_CSRF|ENABLE_CSRF.*PORT/,
    );
  });
});
