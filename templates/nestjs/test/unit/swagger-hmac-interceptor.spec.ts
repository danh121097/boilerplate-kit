/**
 * Dev-only Swagger interceptor: the browser-side signer must produce signatures the
 * server's HmacService accepts, and must leave requests alone without a config.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildHmacBootstrapJs, hmacRequestInterceptor } from "@/common/swagger/hmac-interceptor";
import { HmacService } from "@/common/services/hmac.service";
import type { AppConfigService } from "@/config/app-config.service";

const SECRET = "swagger-interceptor-secret-32-chars!!";
const hmac = new HmacService({ hmacSecret: SECRET } as AppConfigService);

afterEach(() => vi.unstubAllGlobals());

describe("hmacRequestInterceptor", () => {
  it("signs with the server's canonical method, prefix-stripped path and content type", async () => {
    vi.stubGlobal("__HMAC_CFG__", { secret: SECRET, apiPrefix: "/api/v1" });
    const signed = (await hmacRequestInterceptor({
      url: "http://localhost:3000/api/v1/auth/login?source=docs",
      method: "post",
      headers: { "Content-Type": "application/json" },
    })) as { headers: Record<string, string> };

    const result = hmac.verifyHmac({
      method: "POST",
      contentType: "application/json",
      ctime: signed.headers.ctime,
      path: "/auth/login",
      sig: signed.headers.sig,
    });
    expect(result).toBeNull();
  });

  it("signs an empty content type when the request has no body header", async () => {
    vi.stubGlobal("__HMAC_CFG__", { secret: SECRET, apiPrefix: "/api/v1" });
    const signed = (await hmacRequestInterceptor({
      url: "/api/v1/users",
      method: "GET",
      headers: {},
    })) as { headers: Record<string, string> };

    expect(
      hmac.verifyHmac({
        method: "GET",
        contentType: "",
        ctime: signed.headers.ctime,
        path: "/users",
        sig: signed.headers.sig,
      }),
    ).toBeNull();
  });

  it("returns the request untouched when no HMAC config is exposed", async () => {
    const request = { url: "/docs/json", method: "GET", headers: {} };
    await expect(hmacRequestInterceptor(request)).resolves.toBe(request);
    expect(request.headers).toEqual({});
  });
});

describe("buildHmacBootstrapJs", () => {
  it("assigns the secret and prefix to window.__HMAC_CFG__ as JSON", () => {
    const js = buildHmacBootstrapJs("s3cr3t", "/api/v1");
    expect(js).toBe('window.__HMAC_CFG__ = {"secret":"s3cr3t","apiPrefix":"/api/v1"};');
  });
});
