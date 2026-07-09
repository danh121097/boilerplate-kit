import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { createHmac } from "node:crypto";
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

function configFor(url: string, method: string, contentType = "application/json") {
  return {
    url,
    method,
    headers: { "Content-Type": contentType },
  } as unknown as InternalAxiosRequestConfig;
}

describe("hmac-signature", () => {
  // Restore the specific env keys per test — never reassign the whole
  // `process.env` object (that detaches later writes on some Node/jest runtimes).
  const KEYS = ["EXPO_PUBLIC_HMAC_SECRET", "EXPO_PUBLIC_BUILD_VERSION"] as const;
  const snapshot: Record<string, string | undefined> = {};
  beforeEach(() => KEYS.forEach((k) => (snapshot[k] = process.env[k])));
  afterEach(() => {
    KEYS.forEach((k) => {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    });
  });

  it("returns null when no secret is configured", () => {
    delete process.env.EXPO_PUBLIC_HMAC_SECRET;
    expect(HMACSignatureGenerator.generateSignature(configFor("/users", "get"))).toBeNull();
  });

  it("signs an EMPTY content-type for a bodyless GET (no Content-Type header)", () => {
    // Real axios GET sends no body and no Content-Type header — the server reads "".
    // Defaulting to "application/json" here would break the signature (the original bug).
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const config = {
      url: "/users",
      method: "get",
      headers: {},
    } as unknown as InternalAxiosRequestConfig;
    const sig = HMACSignatureGenerator.generateSignature(config);
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs application/json for a request with a body but no explicit header", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const config = {
      url: "/auth/login",
      method: "post",
      headers: {},
      data: { email: "a@b.co" },
    } as unknown as InternalAxiosRequestConfig;
    const sig = HMACSignatureGenerator.generateSignature(config);
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/auth/login"),
    );
  });

  it("normalizes a URL without a leading slash before signing", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const config = {
      url: "users",
      method: "post",
      headers: {},
      data: { name: "x" },
    } as unknown as InternalAxiosRequestConfig;
    const sig = HMACSignatureGenerator.generateSignature(config);
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/users"),
    );
  });

  it("includes the build version as x-version", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    process.env.EXPO_PUBLIC_BUILD_VERSION = "9.9.9";
    const sig = HMACSignatureGenerator.generateSignature(configFor("/x", "get"));
    expect(sig!["x-version"]).toBe("9.9.9");
  });
});
