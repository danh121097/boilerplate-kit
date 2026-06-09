import { installLocalStorage } from "../helpers/fake-storage";
import { persistAccessToken } from "@/services/core/auth-token-storage";
import { HeadersUtils } from "@/services/core/headers-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

function configWith(headers: Record<string, unknown> = {}) {
  return { url: "/x", method: "get", headers } as unknown as InternalAxiosRequestConfig;
}

describe("headers-utils", () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("setAuthHeaders passes headers through unchanged when no HMAC secret", () => {
    const headers = { "Content-Type": "application/json" };
    expect(HeadersUtils.setAuthHeaders(configWith(headers))).toEqual(headers);
  });

  it("setAuthHeaders merges HMAC signature headers when a secret is set", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const result = HeadersUtils.setAuthHeaders(configWith({ "Content-Type": "application/json" }));
    expect(result).toHaveProperty("sig");
    expect(result).toHaveProperty("ctime");
    expect(result["Content-Type"]).toBe("application/json"); // original kept
  });

  it("addAuthorizationHeader attaches a Bearer token when one is stored", () => {
    persistAccessToken("abc", "MAIN");
    const config = configWith();
    HeadersUtils.addAuthorizationHeader(config, "MAIN");
    expect(config.headers.authorization).toBe("Bearer abc");
  });

  it("addAuthorizationHeader is a no-op when no token is stored", () => {
    const config = configWith();
    HeadersUtils.addAuthorizationHeader(config, "MAIN");
    expect(config.headers.authorization).toBeUndefined();
  });
});
