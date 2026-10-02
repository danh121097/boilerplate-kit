import { mockAuthPublicConfig } from "../../../config/mock-auth-public-config";
import { describe, expect, it } from "vitest";

/**
 * A production build declares no mock keys, so a runtime `NUXT_PUBLIC_AUTH_MOCK_*`
 * env var can neither enable the mock nor put its credentials in the public config.
 */
describe("mockAuthPublicConfig", () => {
  it("declares nothing in production", () => {
    expect(mockAuthPublicConfig(true)).toEqual({});
  });

  it("declares the three keys, off by default, outside production", () => {
    expect(mockAuthPublicConfig(false)).toEqual({
      authMock: "",
      authMockEmail: "",
      authMockPassword: "",
    });
  });
});
