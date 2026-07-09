import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { persistAccessToken } from "@/services/core/auth-token-storage";
import { HeadersUtils } from "@/services/core/headers-utils";
import type { InternalAxiosRequestConfig } from "axios";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

function configWith(headers: Record<string, unknown> = {}) {
  return { url: "/x", method: "get", headers } as unknown as InternalAxiosRequestConfig;
}

describe("headers-utils", () => {
  let secretSnapshot: string | undefined;
  beforeEach(() => {
    resetSecureStore();
    secretSnapshot = process.env.EXPO_PUBLIC_HMAC_SECRET;
  });
  afterEach(() => {
    if (secretSnapshot === undefined) delete process.env.EXPO_PUBLIC_HMAC_SECRET;
    else process.env.EXPO_PUBLIC_HMAC_SECRET = secretSnapshot;
  });

  it("setAuthHeaders passes headers through unchanged when no HMAC secret", () => {
    delete process.env.EXPO_PUBLIC_HMAC_SECRET;
    const headers = { "Content-Type": "application/json" };
    expect(HeadersUtils.setAuthHeaders(configWith(headers))).toEqual(headers);
  });

  it("setAuthHeaders merges HMAC signature headers when a secret is set", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const result = HeadersUtils.setAuthHeaders(configWith({ "Content-Type": "application/json" }));
    expect(result).toHaveProperty("sig");
    expect(result).toHaveProperty("ctime");
    expect(result["Content-Type"]).toBe("application/json"); // original kept
  });

  it("addAuthorizationHeader attaches a Bearer token when one is stored", async () => {
    await persistAccessToken("abc", "MAIN");
    const config = configWith();
    await HeadersUtils.addAuthorizationHeader(config, "MAIN");
    expect(config.headers.authorization).toBe("Bearer abc");
  });

  it("addAuthorizationHeader is a no-op when no token is stored", async () => {
    const config = configWith();
    await HeadersUtils.addAuthorizationHeader(config, "MAIN");
    expect(config.headers.authorization).toBeUndefined();
  });
});
