import { makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api } from "@/services/core/api";
import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { HMACSignatureGenerator, resolveContentType } from "@/services/core/hmac-signature";
import axios, { AxiosHeaders } from "axios";
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

describe("hmac-signature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("signs the Content-Type actually sent: pinned type with a body, '' without one", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    const withBody = HMACSignatureGenerator.generateSignature(
      configFor("/notes", "post", { contentType: "text/plain", data: "hi" }),
    );
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
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(HMACSignatureGenerator.generateSignature(configFor("/users", "get"))).toBeNull();
  });

  describe("empty secret warning", () => {
    const message =
      "NEXT_PUBLIC_HMAC_SECRET is empty; the backend requires it, all requests will 401.";

    async function signWithoutSecret(times = 1) {
      vi.resetModules();
      const { HMACSignatureGenerator: fresh } = await import("@/services/core/hmac-signature");
      for (let i = 0; i < times; i++) fresh.signRequest({ method: "GET", path: "/users" });
    }

    it("warns once per page load when the secret is empty and mock auth is off", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await signWithoutSecret(3);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(message);
    });

    it("stays quiet in a production build", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("NODE_ENV", "production");
      await signWithoutSecret();
      expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet when mock auth is on, or when a secret is set", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "true");
      await signWithoutSecret();
      vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "");
      vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
      await signWithoutSecret();
      expect(warn.mock.calls.filter(([m]) => m === message)).toEqual([]);
    });
  });

  it("signs '' (empty contentType) for bodyless GET — matches server canonical string", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    // GET with no body → contentType signed as "" (axios omits Content-Type on bodyless requests)
    const sig = HMACSignatureGenerator.generateSignature(configFor("/users", "get"));
    expect(sig).not.toBeNull();
    expect(typeof sig!.ctime).toBe("number");
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs 'application/json' for POST with a body — matches server canonical string", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("/auth/login", "post", { data: { email: "a@b.com" } }),
    );
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/auth/login"),
    );
  });

  it("normalizes a URL without a leading slash before signing", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    // POST with body → signed as "application/json"
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("users", "post", { data: { name: "x" } }),
    );
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", sig!.ctime, "/users"),
    );
  });

  it("includes the build version as x-version", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    vi.stubEnv("NEXT_PUBLIC_BUILD_VERSION", "9.9.9");
    const sig = HMACSignatureGenerator.generateSignature(configFor("/x", "get"));
    expect(sig!["x-version"]).toBe("9.9.9");
  });

  it("signRequest (pure) signs with the provided contentType", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
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

  it("never signs the query string, inline or via params", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    const config = { ...configFor("/users?page=2&q=a", "get"), params: { limit: 5 } };
    const sig = HMACSignatureGenerator.generateSignature(config as InternalAxiosRequestConfig);
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs a pinned charset exactly as it is sent", () => {
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
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
    vi.stubEnv("NEXT_PUBLIC_HMAC_SECRET", "shared-secret");
    const pinned = "application/json; charset=utf-8";
    let sent: Record<string, unknown> = {};
    const http = makeClient(async (config) => {
      sent = { ...(config.headers as unknown as Record<string, unknown>) };
      return ok(config, { success: true, data: null });
    });

    await http.post("/notes?draft=1", { a: 1 }, { headers: { "Content-Type": pinned } });

    expect(sent["Content-Type"]).toBe(pinned);
    expect(sent.sig).toBe(
      serverSign("shared-secret", "POST", pinned, Number(sent.ctime), "/notes"),
    );
  });
});

describe("resolveContentType — signs what axios sends", () => {
  const JSON_TYPE = "application/json";
  const FORM = "application/x-www-form-urlencoded";
  const config = (data: unknown, headers: unknown = {}) =>
    ({ url: "/x", method: "post", data, headers }) as unknown as InternalAxiosRequestConfig;

  it.each([
    ["no body", config(undefined, { "Content-Type": JSON_TYPE }), ""],
    [
      "null body, pinned JSON (axios sends `null`)",
      config(null, { "Content-Type": JSON_TYPE }),
      JSON_TYPE,
    ],
    ["null body, nothing pinned", config(null), JSON_TYPE],
    [
      "URLSearchParams, nothing pinned",
      config(new URLSearchParams("a=1")),
      `${FORM};charset=utf-8`,
    ],
    [
      "URLSearchParams, pinned JSON",
      config(new URLSearchParams("a=1"), { "Content-Type": JSON_TYPE }),
      JSON_TYPE,
    ],
    ["string, nothing pinned", config("a=1"), FORM],
    ["object, nothing pinned", config({ a: 1 }), JSON_TYPE],
    ["lowercase pinned header", config({ a: 1 }, { "content-type": "text/plain" }), "text/plain"],
    [
      "AxiosHeaders instance",
      config({ a: 1 }, new AxiosHeaders({ "Content-Type": "application/json; charset=utf-8" })),
      "application/json; charset=utf-8",
    ],
  ])("%s", (_label, input, expected) => {
    expect(resolveContentType(input)).toBe(expected);
  });
});
