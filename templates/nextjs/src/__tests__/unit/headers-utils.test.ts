import { HeadersUtils } from "@/services/core/headers-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

function configWith(headers: Record<string, unknown> = {}) {
  return { url: "/x", method: "get", headers } as unknown as InternalAxiosRequestConfig;
}

describe("HeadersUtils", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("setAuthHeaders passes headers through unchanged when no HMAC secret", () => {
    const headers = { "Content-Type": "application/json" };
    expect(HeadersUtils.setAuthHeaders(configWith(headers))).toEqual(headers);
  });

  it("setAuthHeaders merges HMAC signature headers when a secret is set", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    const result = HeadersUtils.setAuthHeaders(configWith({ "Content-Type": "application/json" }));
    expect(result).toHaveProperty("sig");
    expect(result).toHaveProperty("ctime");
    expect(result["Content-Type"]).toBe("application/json");
  });

  it("does not add an Authorization header (cookie-first — no Bearer)", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    const result = HeadersUtils.setAuthHeaders(configWith());
    expect(result).not.toHaveProperty("authorization");
    expect(result).not.toHaveProperty("Authorization");
  });
});
