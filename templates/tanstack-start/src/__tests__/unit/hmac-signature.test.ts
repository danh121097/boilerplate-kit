import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

/** Re-implements the SERVER's signing (Express `verifyHmac`) to prove the client
 * signs exactly what the backend verifies. */
function serverSign(
  secret: string,
  method: string,
  contentType: string,
  ctime: number,
  path: string,
) {
  const stringToSign = [method.toUpperCase(), contentType, String(ctime), path, ""].join("\n");
  return createHmac("sha256", secret).update(stringToSign).digest("base64");
}

/** A config carrying the axios instance default Content-Type header. `data` is
 * omitted for bodyless requests (GET, etc.) and set for requests with a body. */
function configFor(url: string, method: string, data?: unknown) {
  return {
    url,
    method,
    data,
    headers: { "Content-Type": "application/json" },
  } as unknown as InternalAxiosRequestConfig;
}

describe("hmac-signature", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns null when no secret is configured", () => {
    vi.stubEnv("VITE_HMAC_SECRET", ""); // env-independent: explicit empty secret
    expect(HMACSignatureGenerator.generateSignature(configFor("/users", "get"))).toBeNull();
  });

  it("signs a bodyless request with an EMPTY content-type (axios sends none)", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(configFor("/users", "get"));
    expect(sig).not.toBeNull();
    expect(typeof sig!.ctime).toBe("number");
    // The backend signs the Content-Type it receives — nothing — so we sign "".
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs a request WITH a body using application/json", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("/auth/login", "post", { email: "a" }),
    );
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/auth/login"),
    );
  });

  it("normalizes a URL without a leading slash before signing", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(configFor("users", "post", { a: 1 }));
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/users"),
    );
  });

  it("includes the build version as x-version", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    vi.stubEnv("VITE_BUILD_VERSION", "9.9.9");
    const sig = HMACSignatureGenerator.generateSignature(configFor("/x", "get"));
    expect(sig!["x-version"]).toBe("9.9.9");
  });
});
