import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { HeadersUtils } from "@/services/core/headers-utils";
import { HMACSignatureGenerator, resolveContentType } from "@/services/core/hmac-signature";
import { AxiosHeaders } from "axios";
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

describe("hmac-signature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null when no secret is configured", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "");
    expect(HMACSignatureGenerator.generateSignature(configFor("/users", "get"))).toBeNull();
  });

  it("signs '' (empty contentType) for bodyless GET — matches server canonical string", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    // GET with no body → contentType signed as "" (axios omits Content-Type on bodyless requests)
    const sig = HMACSignatureGenerator.generateSignature(configFor("/users", "get"));
    expect(sig).not.toBeNull();
    expect(typeof sig!.ctime).toBe("number");
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs 'application/json' for POST with a body — matches server canonical string", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("/auth/login", "post", { data: { email: "a@b.com" } }),
    );
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/auth/login"),
    );
  });

  it("signs the path without ?query / #hash — the server verifies it stripped", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(configFor("/users?page=2#top", "get"));
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs a pinned Content-Type exactly as sent, charset included", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const config = configFor("/notes", "post", {
      data: { a: 1 },
      contentType: "application/json; charset=utf-8",
    });
    const headers = HeadersUtils.setAuthHeaders(config) as unknown as Record<string, unknown>;
    expect(headers["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(headers.sig).toBe(
      serverSign(
        "shared-secret",
        "POST",
        "application/json; charset=utf-8",
        Number(headers.ctime),
        "/notes",
      ),
    );
  });

  it("a real request signs its sent Content-Type and the path without any query", async () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    installLocalStorage();
    const seen: InternalAxiosRequestConfig[] = [];
    const client = makeClient(async (config) => {
      seen.push(config);
      return ok(config, { success: true });
    });

    await client.get("/users?page=2", { params: { limit: 5 } });
    await client.post("/notes?draft=1", { a: 1 });

    for (const [config, method, path] of [
      [seen[0]!, "GET", "/users"],
      [seen[1]!, "POST", "/notes"],
    ] as const) {
      const headers = config.headers;
      const sent = config.data === undefined ? "" : String(headers.get("Content-Type") ?? "");
      expect(headers.get("sig")).toBe(
        serverSign("shared-secret", method, sent, Number(headers.get("ctime")), path),
      );
    }
    expect(String(seen[1]!.headers.get("Content-Type"))).toBe("application/json");
  });

  it("normalizes a URL without a leading slash before signing", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("users", "post", { data: { name: "x" } }),
    );
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

const requestWith = (data: unknown, headers: Record<string, string> | AxiosHeaders = {}) =>
  ({ data, headers }) as unknown as InternalAxiosRequestConfig;

/** The signed Content-Type must be exactly the header axios will send. */
describe("resolveContentType", () => {
  it.each([
    ["no body", requestWith(undefined), ""],
    [
      "no body with a pinned type",
      requestWith(undefined, { "Content-Type": "application/json" }),
      "",
    ],
    ["a null body", requestWith(null), "application/json"],
    ["a plain object", requestWith({ a: 1 }), "application/json"],
    ["a string body", requestWith("a=1"), "application/x-www-form-urlencoded"],
    [
      "URLSearchParams",
      requestWith(new URLSearchParams("a=1")),
      "application/x-www-form-urlencoded;charset=utf-8",
    ],
    [
      "a lowercase pinned header",
      requestWith({ a: 1 }, { "content-type": "text/plain" }),
      "text/plain",
    ],
    [
      "a pinned header with a charset, signed as sent",
      requestWith({ a: 1 }, { "Content-Type": "application/json; charset=utf-8" }),
      "application/json; charset=utf-8",
    ],
    [
      "an AxiosHeaders instance",
      requestWith({ a: 1 }, new AxiosHeaders({ "Content-Type": "application/vnd.api+json" })),
      "application/vnd.api+json",
    ],
  ])("%s", (_label, input, expected) => {
    expect(resolveContentType(input)).toBe(expected);
  });
});
