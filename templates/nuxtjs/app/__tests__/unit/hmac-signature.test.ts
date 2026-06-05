import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

/** Re-implements the SERVER's signing (Express `verifyHmac`) to prove the client
 * signs exactly what the backend verifies. */
function serverSign(secret: string, method: string, contentType: string, ctime: number, path: string) {
  const stringToSign = [method.toUpperCase(), contentType, String(ctime), path, ""].join("\n");
  return createHmac("sha256", secret).update(stringToSign).digest("base64");
}

function configFor(url: string, method: string, contentType = "application/json") {
  return { url, method, headers: { "Content-Type": contentType } } as unknown as InternalAxiosRequestConfig;
}

function stubRuntime(pub: Record<string, unknown>) {
  vi.stubGlobal("useRuntimeConfig", () => ({ public: pub }));
}

describe("hmac-signature", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when no secret is configured", () => {
    stubRuntime({});
    expect(HMACSignatureGenerator.generateSignature(configFor("/users", "get"))).toBeNull();
  });

  it("produces a signature matching the server's canonical string", () => {
    stubRuntime({ hmacSecret: "shared-secret" });
    const sig = HMACSignatureGenerator.generateSignature(configFor("/users", "get"));
    expect(sig).not.toBeNull();
    expect(typeof sig!.ctime).toBe("number");
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "application/json", sig!.ctime, "/users"));
  });

  it("normalizes a URL without a leading slash before signing", () => {
    stubRuntime({ hmacSecret: "shared-secret" });
    const sig = HMACSignatureGenerator.generateSignature(configFor("users", "post"));
    expect(sig!.sig).toBe(serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/users"));
  });

  it("includes the build version as x-version", () => {
    stubRuntime({ hmacSecret: "shared-secret", buildVersion: "9.9.9" });
    const sig = HMACSignatureGenerator.generateSignature(configFor("/x", "get"));
    expect(sig!["x-version"]).toBe("9.9.9");
  });
});
