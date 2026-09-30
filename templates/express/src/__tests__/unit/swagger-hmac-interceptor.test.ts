import { config } from "@/config/environment";
import { hmacRequestInterceptor } from "@/docs/hmac-interceptor";
import { verifyHmac } from "@/utils/hmac";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("Swagger HMAC request interceptor", () => {
  it("signs API requests with the server's canonical method, path, and content type", async () => {
    vi.stubGlobal("__HMAC_CFG__", {
      secret: config.hmacSecret,
      apiPrefix: config.apiPrefix,
    });
    const request = {
      url: `http://localhost${config.apiPrefix}/auth/login?source=docs`,
      method: "post",
      headers: { "Content-Type": "application/json" },
    };

    const signed = await hmacRequestInterceptor(request);

    expect(
      verifyHmac({
        method: "POST",
        contentType: "application/json",
        ctime: signed.headers.ctime,
        path: "/auth/login",
        sig: signed.headers.sig,
      }),
    ).toBeNull();
  });

  it("leaves requests outside the API prefix unchanged", async () => {
    vi.stubGlobal("__HMAC_CFG__", {
      secret: config.hmacSecret,
      apiPrefix: config.apiPrefix,
    });
    const request = { url: "/docs/json", method: "GET", headers: {} };

    await expect(hmacRequestInterceptor(request)).resolves.toBe(request);
    expect(request.headers).toEqual({});
  });
});
