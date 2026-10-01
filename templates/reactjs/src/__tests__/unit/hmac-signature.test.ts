import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api } from "@/services/core/api";
import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { HMACSignatureGenerator, resolveContentType } from "@/services/core/hmac-signature";
import axios, { AxiosHeaders } from "axios";
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
    vi.restoreAllMocks();
  });

  it("returns null when no secret is configured", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "");
    expect(HMACSignatureGenerator.generateSignature(configFor("/users", "get"))).toBeNull();
  });

  describe("empty secret warning", () => {
    const MESSAGE = "VITE_HMAC_SECRET is empty; the backend requires it, all requests will 401.";

    /** A fresh module graph, so the once-per-load flag starts unset. */
    async function load() {
      vi.resetModules();
      const { HMACSignatureGenerator: Fresh } = await import("@/services/core/hmac-signature");
      return Fresh;
    }
    const sign = (gen: typeof HMACSignatureGenerator) =>
      gen.signRequest({ method: "get", path: "/users" });

    it("warns once in a dev build when the secret is empty and mock auth is off", async () => {
      vi.stubEnv("VITE_HMAC_SECRET", "");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const gen = await load();

      expect(sign(gen)).toBeNull();
      sign(gen);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(MESSAGE);
    });

    it("stays silent in a production build", async () => {
      vi.stubEnv("VITE_HMAC_SECRET", "");
      vi.stubEnv("DEV", false);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      sign(await load());

      expect(warn).not.toHaveBeenCalledWith(MESSAGE);
    });

    it("stays silent when mock auth is on", async () => {
      vi.stubEnv("VITE_HMAC_SECRET", "");
      vi.stubEnv("VITE_AUTH_MOCK", "true");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      sign(await load());

      expect(warn).not.toHaveBeenCalledWith(MESSAGE);
    });

    it("stays silent, and never prints the secret, when one is set", async () => {
      vi.stubEnv("VITE_HMAC_SECRET", "s3cret-value");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(sign(await load())).not.toBeNull();

      expect(warn).not.toHaveBeenCalled();
    });
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

  it("never signs the query string, inline or via params", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const config = { ...configFor("/users?page=2&q=a", "get"), params: { limit: 5 } };
    const sig = HMACSignatureGenerator.generateSignature(config as InternalAxiosRequestConfig);
    expect(sig!.sig).toBe(serverSign("shared-secret", "GET", "", sig!.ctime, "/users"));
  });

  it("signs a pinned charset exactly as it is sent", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const pinned = "application/json; charset=utf-8";
    const sig = HMACSignatureGenerator.generateSignature(
      configFor("/notes", "post", { contentType: pinned, data: { a: 1 } }),
    );
    expect(sig!.sig).toBe(serverSign("shared-secret", "POST", pinned, sig!.ctime, "/notes"));
  });

  it("the request interceptor sends the pinned Content-Type unchanged and signs that value", async () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    installLocalStorage();
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

  it("the refresh client signs its JSON body's Content-Type", async () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    installLocalStorage();
    Api.setBaseURL("http://api.test", "MAIN");
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { data: { tokens: { accessToken: "AT" } } } });

    await createTokenRefresher("/auth/refresh", "MAIN")();

    const [, body, options] = post.mock.calls[0]!;
    const headers = options!.headers as Record<string, string | number>;
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
  });

  it("signs the pinned request header of a bodyless request as ''", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(configFor("/users", "delete"));
    expect(sig!.sig).toBe(serverSign("shared-secret", "DELETE", "", sig!.ctime, "/users"));
  });
});

/** A request config as the request interceptor sees it. */
function requestWith(data: unknown, headers: Record<string, unknown> | AxiosHeaders = {}) {
  return { url: "/x", method: "post", data, headers } as unknown as InternalAxiosRequestConfig;
}

describe("signed Content-Type matches what axios sends", () => {
  const form = new URLSearchParams({ a: "1" });

  it.each([
    ["no body", requestWith(undefined, { "Content-Type": "application/json" }), ""],
    [
      "null body, JSON pinned",
      requestWith(null, { "Content-Type": "application/json" }),
      "application/json",
    ],
    ["null body, nothing pinned", requestWith(null), "application/json"],
    ["object body, nothing pinned", requestWith({ a: 1 }), "application/json"],
    [
      "URLSearchParams, nothing pinned",
      requestWith(form),
      "application/x-www-form-urlencoded;charset=utf-8",
    ],
    ["string body, nothing pinned", requestWith("a=1"), "application/x-www-form-urlencoded"],
    [
      "URLSearchParams, JSON pinned",
      requestWith(form, { "Content-Type": "application/json" }),
      "application/json",
    ],
    [
      "lowercase pinned header",
      requestWith({ a: 1 }, { "content-type": "text/plain" }),
      "text/plain",
    ],
    ["upper-case pinned header", requestWith("x", { "CONTENT-TYPE": "text/csv" }), "text/csv"],
    [
      "AxiosHeaders instance",
      requestWith(
        { a: 1 },
        new AxiosHeaders({ "content-type": "application/json; charset=utf-8" }),
      ),
      "application/json; charset=utf-8",
    ],
    [
      "AxiosHeaders without a pinned type",
      requestWith("a=1", new AxiosHeaders()),
      "application/x-www-form-urlencoded",
    ],
  ])("%s → %j", (_label, config, expected) => {
    expect(resolveContentType(config)).toBe(expected);
  });

  it("the signature uses the resolved Content-Type", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.generateSignature(requestWith(form));
    expect(sig!.sig).toBe(
      serverSign(
        "shared-secret",
        "POST",
        "application/x-www-form-urlencoded;charset=utf-8",
        sig!.ctime,
        "/x",
      ),
    );
    vi.unstubAllEnvs();
  });

  it("signRequest signs the given method, path and Content-Type", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const sig = HMACSignatureGenerator.signRequest({
      method: "post",
      path: "/auth/refresh#x",
      contentType: "",
      ctime: 1000,
    });
    expect(sig).toMatchObject({ ctime: 1000 });
    expect(sig!.sig).toBe(serverSign("shared-secret", "POST", "", 1000, "/auth/refresh"));
    vi.unstubAllEnvs();
  });
});
