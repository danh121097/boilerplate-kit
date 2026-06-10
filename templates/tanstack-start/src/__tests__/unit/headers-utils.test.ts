import { HeadersUtils } from "@/services/core/headers-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

function makeConfig(url = "/test", method = "get"): InternalAxiosRequestConfig {
  return {
    url,
    method,
    headers: { "Content-Type": "application/json" } as AxiosRequestHeaders,
  } as InternalAxiosRequestConfig;
}

/**
 * Cookie-based auth: HeadersUtils only attaches HMAC integrity headers. It never
 * adds an Authorization header — the httpOnly access-token cookie is sent
 * automatically by the browser (the axios client uses `withCredentials`).
 */
describe("HeadersUtils.setAuthHeaders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the headers unchanged when no HMAC secret is configured", () => {
    const config = makeConfig();
    const headers = HeadersUtils.setAuthHeaders(config);
    expect(headers).toBe(config.headers);
    expect(headers.authorization).toBeUndefined();
  });

  it("attaches HMAC signature headers (sig/ctime) when a secret is set", () => {
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    const headers = HeadersUtils.setAuthHeaders(makeConfig("/users", "get"));
    expect(typeof headers.sig).toBe("string");
    expect(typeof headers.ctime).toBe("number");
    // Still no bearer/authorization — auth is cookie-based.
    expect(headers.authorization).toBeUndefined();
  });
});
