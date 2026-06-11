import { HeadersUtils } from "@/services/core/headers-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

function configWith(headers: Record<string, unknown> = {}) {
  return { url: "/x", method: "get", headers } as unknown as InternalAxiosRequestConfig;
}

/** Nuxt reads the HMAC secret from `runtimeConfig.public` — mock it for unit tests. */
function stubSecret(hmacSecret?: string) {
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { hmacSecret, buildVersion: "1.0.0" } }));
}

describe("HeadersUtils", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("setAuthHeaders passes headers through unchanged when no HMAC secret", () => {
    stubSecret(undefined);
    const headers = { "Content-Type": "application/json" };
    expect(HeadersUtils.setAuthHeaders(configWith(headers))).toEqual(headers);
  });

  it("setAuthHeaders merges HMAC signature headers when a secret is set", () => {
    stubSecret("shared-secret");
    const result = HeadersUtils.setAuthHeaders(configWith({ "Content-Type": "application/json" }));
    expect(result).toHaveProperty("sig");
    expect(result).toHaveProperty("ctime");
    expect(result["Content-Type"]).toBe("application/json");
  });

  it("does not add an Authorization header (cookie-first — no Bearer)", () => {
    stubSecret("shared-secret");
    const result = HeadersUtils.setAuthHeaders(configWith());
    expect(result).not.toHaveProperty("authorization");
    expect(result).not.toHaveProperty("Authorization");
  });
});
