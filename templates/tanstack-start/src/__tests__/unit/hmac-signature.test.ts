import { makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api } from "@/services/core/api";
import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axios from "axios";

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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("signs the Content-Type actually sent: a pinned type with a body, '' without one", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const plain = {
      url: "/notes",
      method: "post",
      data: "hi",
      headers: { "Content-Type": "text/plain" },
    } as unknown as InternalAxiosRequestConfig;
    const withBody = HMACSignatureGenerator.generateSignature(plain);
    expect(withBody!.sig).toBe(
      serverSign("shared-secret", "POST", "text/plain", withBody!.ctime, "/notes"),
    );

    // Instance-pinned JSON header, but no body → axios drops Content-Type → "".
    const bodyless = HMACSignatureGenerator.generateSignature(configFor("/auth/logout", "post"));
    expect(bodyless!.sig).toBe(
      serverSign("shared-secret", "POST", "", bodyless!.ctime, "/auth/logout"),
    );
  });

  it("the refresh client signs '' — it posts no body, so no Content-Type is sent", async () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    Api.setBaseURL("http://api.test", "MAIN");
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} });

    await createTokenRefresher("/auth/refresh", "MAIN")();

    const [, body, options] = post.mock.calls[0]!;
    const headers = options!.headers as Record<string, string | number>;
    expect(body).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers.sig).toBe(
      serverSign("shared-secret", "POST", "", Number(headers.ctime), "/auth/refresh"),
    );
  });

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
  it("never signs the query string, inline or via params", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const config = { ...configFor("/users?page=2&q=a", "get"), params: { limit: 5 } };
    const sig = HMACSignatureGenerator.generateSignature(config as InternalAxiosRequestConfig);
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs a pinned charset exactly as it is sent", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const pinned = "application/json; charset=utf-8";
    const config = {
      url: "/notes",
      method: "post",
      data: { a: 1 },
      headers: { "Content-Type": pinned },
    } as unknown as InternalAxiosRequestConfig;
    const sig = HMACSignatureGenerator.generateSignature(config);
    expect(sig!.sig).toBe(serverSign("shared-secret", "POST", pinned, sig!.ctime, "/notes"));
  });

  it("the request interceptor sends the pinned Content-Type unchanged and signs that value", async () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const pinned = "application/json; charset=utf-8";
    let sent: Record<string, unknown> = {};
    const http = makeClient(async (config) => {
      sent = { ...(config.headers as unknown as Record<string, unknown>) };
      return ok(config, { status: "success", data: null });
    });

    await http.post("/notes?draft=1", { a: 1 }, { headers: { "Content-Type": pinned } });

    expect(sent["Content-Type"]).toBe(pinned);
    expect(sent.sig).toBe(
      serverSign("shared-secret", "POST", pinned, Number(sent.ctime), "/notes"),
    );
  });
});
