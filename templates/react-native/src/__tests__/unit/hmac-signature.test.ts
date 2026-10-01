import { HMACSignatureGenerator, resolveContentType } from "@/services/core/hmac-signature";
import { AxiosHeaders } from "axios";
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

  it.each([
    ["text/plain", { "Content-Type": "text/plain" }],
    ["application/x-www-form-urlencoded", { "content-type": "application/x-www-form-urlencoded" }],
    ["multipart/form-data", AxiosHeaders.from({ "Content-Type": "multipart/form-data" })],
  ])("signs the pinned %s when the request has a body", (expected, headers) => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const config = {
      url: "/upload",
      method: "post",
      headers,
      data: "payload",
    } as unknown as InternalAxiosRequestConfig;
    const sig = HMACSignatureGenerator.generateSignature(config);
    expect(sig!.sig).toBe(serverSign("shared-secret", "POST", expected, sig!.ctime, "/upload"));
  });

  it("signs an empty content-type for a bodyless POST even when a type is pinned", () => {
    // axios strips Content-Type when there is no body, so the server reads "".
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const sig = HMACSignatureGenerator.generateSignature(configFor("/auth/logout", "post"));
    expect(sig!.sig).toBe(serverSign("shared-secret", "POST", "", sig!.ctime, "/auth/logout"));
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

  it("signs the path without an inline query string", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const config = {
      url: "/users?page=2&q=a",
      method: "get",
      headers: {},
    } as unknown as InternalAxiosRequestConfig;
    const sig = HMACSignatureGenerator.generateSignature(config);
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs the path without a #hash", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const config = { url: "/users#top", method: "get", headers: {} } as never;
    const sig = HMACSignatureGenerator.generateSignature(config);
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signRequest signs the given method, content type and path", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const sig = HMACSignatureGenerator.signRequest({
      method: "post",
      path: "auth/refresh?x=1",
      contentType: "application/json",
      ctime: 1234,
    });
    expect(sig).toMatchObject({ ctime: 1234 });
    expect(sig!.sig).toBe(
      serverSign("shared-secret", "POST", "application/json", 1234, "/auth/refresh"),
    );
  });

  it("signRequest signs application/json when no content type is given", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    const sig = HMACSignatureGenerator.signRequest({ method: "post", path: "/x", ctime: 1 });
    expect(sig!.sig).toBe(serverSign("shared-secret", "POST", "application/json", 1, "/x"));
  });

  it("includes the build version as x-version", () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    process.env.EXPO_PUBLIC_BUILD_VERSION = "9.9.9";
    const sig = HMACSignatureGenerator.generateSignature(configFor("/x", "get"));
    expect(sig!["x-version"]).toBe("9.9.9");
  });

  describe("empty secret warning", () => {
    let mockSnapshot: string | undefined;

    const MESSAGE =
      "EXPO_PUBLIC_HMAC_SECRET is empty; the backend requires it, all requests will 401.";
    const setDev = (value: boolean) => Object.assign(globalThis, { __DEV__: value });
    const sign = (g: typeof HMACSignatureGenerator) =>
      g.signRequest({ method: "GET", path: "/users" });

    /** A fresh module instance, so the once-per-launch guard starts unset. */
    function freshSigner() {
      jest.resetModules();
      return require("@/services/core/hmac-signature")
        .HMACSignatureGenerator as typeof HMACSignatureGenerator;
    }

    beforeEach(() => {
      mockSnapshot = process.env.EXPO_PUBLIC_AUTH_MOCK;
      delete process.env.EXPO_PUBLIC_AUTH_MOCK;
      delete process.env.EXPO_PUBLIC_HMAC_SECRET;
    });
    afterEach(() => {
      setDev(true);
      if (mockSnapshot === undefined) delete process.env.EXPO_PUBLIC_AUTH_MOCK;
      else process.env.EXPO_PUBLIC_AUTH_MOCK = mockSnapshot;
      jest.restoreAllMocks();
    });

    it("warns once in a dev build when the secret is empty and the mock is off", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const signer = freshSigner();
      expect(sign(signer)).toBeNull();
      sign(signer);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(MESSAGE);
    });

    it("stays quiet in a production build", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      setDev(false);
      sign(freshSigner());
      expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet when mock auth is on (it answers without the backend)", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.EXPO_PUBLIC_AUTH_MOCK = "true";
      sign(freshSigner());
      expect(warn).not.toHaveBeenCalledWith(MESSAGE);
    });

    it("stays quiet, and never prints the secret, when one is set", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
      sign(freshSigner());
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it("the refresh client signs application/json because it always sends a JSON body", async () => {
    process.env.EXPO_PUBLIC_HMAC_SECRET = "shared-secret";
    jest.resetModules();
    jest.doMock("expo-secure-store", () =>
      require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
    );
    const axiosMod = require("axios").default as typeof import("axios").default;
    const post = jest.spyOn(axiosMod, "post").mockResolvedValue({
      data: { data: { tokens: { accessToken: "A" } } },
    } as never);
    const { createTokenRefresher } = require("@/services/core/auth-refresh-client");

    await createTokenRefresher("/auth/refresh", "MAIN")();

    const [, body, opts] = post.mock.calls[0]!;
    // Bearer + body tokens only: the native cookie jar stays out of the refresh call.
    expect((opts as { withCredentials?: boolean }).withCredentials).toBe(false);
    const headers = (opts as { headers: Record<string, string | number> }).headers;
    expect(body).toEqual({ refreshToken: undefined });
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.sig).toBe(
      serverSign(
        "shared-secret",
        "POST",
        "application/json",
        Number(headers.ctime),
        "/auth/refresh",
      ),
    );
    post.mockRestore();
  });
});

describe("resolveContentType (what axios sends)", () => {
  const JSON_TYPE = "application/json";
  it.each([
    ["no body", undefined, {}, ""],
    ["a null body", null, {}, JSON_TYPE],
    ["a null body with a pinned type", null, { "Content-Type": "text/plain" }, "text/plain"],
    [
      "URLSearchParams",
      new URLSearchParams("a=1"),
      {},
      "application/x-www-form-urlencoded;charset=utf-8",
    ],
    ["a string", "a=1", {}, "application/x-www-form-urlencoded"],
    ["an object", { a: 1 }, {}, JSON_TYPE],
    ["a lowercase pinned header", { a: 1 }, { "content-type": "text/csv" }, "text/csv"],
    [
      "an AxiosHeaders instance",
      { a: 1 },
      AxiosHeaders.from({ "Content-Type": "application/vnd.api+json" }),
      "application/vnd.api+json",
    ],
  ])("%s", (_label, data, headers, expected) => {
    const config = { url: "/x", method: "post", headers, data } as never;
    expect(resolveContentType(config)).toBe(expected);
  });
});
