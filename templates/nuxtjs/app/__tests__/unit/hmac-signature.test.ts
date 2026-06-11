import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

/**
 * Re-implements the SERVER's signing (Express `verifyHmac`) to prove the client
 * signs exactly what the backend verifies.
 */
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

function configFor(
  url: string,
  method: string,
  opts: { contentType?: string; data?: unknown } = {},
) {
  const { contentType = "application/json", data } = opts;
  return {
    url,
    method,
    data,
    headers: { "Content-Type": contentType },
  } as unknown as InternalAxiosRequestConfig;
}

/** Nuxt reads the HMAC secret from `runtimeConfig.public` — mock it for unit tests. */
function stubSecret(hmacSecret?: string, buildVersion = "1.0.0") {
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { hmacSecret, buildVersion } }));
}

describe("hmac-signature", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when no secret is configured", () => {
    stubSecret(undefined);
    expect(HMACSignatureGenerator.generateSignature(configFor("/users", "get"))).toBeNull();
  });

  it("signs '' (empty contentType) for bodyless GET — matches server canonical string", () => {
    stubSecret("shared-secret");
    // GET with no body → contentType signed as "" (axios omits Content-Type on bodyless requests)
    const sig = HMACSignatureGenerator.generateSignature(configFor("/users", "get"));
    expect(sig).not.toBeNull();
    expect(typeof sig!.ctime).toBe("number");
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs 'application/json' for POST with a body — matches server canonical string", () => {
    stubSecret("shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("/auth/login", "post", { data: { email: "a@b.com" } }),
    );
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/auth/login"),
    );
  });

  it("normalizes a URL without a leading slash before signing", () => {
    stubSecret("shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("users", "post", { data: { name: "x" } }),
    );
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/users"),
    );
  });

  it("includes the build version as x-version", () => {
    stubSecret("shared-secret", "9.9.9");
    const sig = HMACSignatureGenerator.generateSignature(configFor("/x", "get"));
    expect(sig!["x-version"]).toBe("9.9.9");
  });

  it("signRequest (pure) signs with the provided contentType", () => {
    stubSecret("shared-secret");
    const ctime = Date.now();
    const sig = HMACSignatureGenerator.signRequest({
      method: "GET",
      path: "/auth/me",
      contentType: "",
      ctime,
    });
    expect(sig).not.toBeNull();
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", ctime, "/auth/me"));
  });
});
