import { hmacRequestInterceptor } from "@/docs/hmac-interceptor";
import { config } from "@/config/environment";
import { verifyHmac } from "@/utils/hmac";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  delete (globalThis as typeof globalThis & { __HMAC_CFG__?: unknown }).__HMAC_CFG__;
  vi.unstubAllGlobals();
});

describe("Swagger HMAC request interceptor", () => {
  it("signs API requests with the server's canonical method, path, and content type", async () => {
    const fetchConfig = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ secret: config.hmacSecret, apiPrefix: config.apiPrefix }),
    });
    vi.stubGlobal("fetch", fetchConfig);
    const request = {
      url: `http://localhost${config.apiPrefix}/auth/login?source=docs`,
      method: "post",
      headers: { "Content-Type": "application/json" },
    };

    const signed = await hmacRequestInterceptor(request);

    expect(fetchConfig).toHaveBeenCalledWith("/docs/hmac-config");
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

  it("does not request HMAC configuration for Swagger resources", async () => {
    const fetchConfig = vi.fn();
    vi.stubGlobal("fetch", fetchConfig);
    const request = { url: "/docs/json", method: "GET", headers: {} };

    await expect(hmacRequestInterceptor(request)).resolves.toBe(request);
    expect(fetchConfig).not.toHaveBeenCalled();
  });
});
