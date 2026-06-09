import { installLocalStorage, simulateServerEnvironment } from "../helpers/fake-storage";
import { persistAccessToken } from "@/services/core/auth-token-storage";
import { HeadersUtils } from "@/services/core/headers-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

function makeConfig(url = "/test", method = "get"): InternalAxiosRequestConfig {
  return {
    url,
    method,
    headers: { "Content-Type": "application/json" } as AxiosRequestHeaders,
  } as InternalAxiosRequestConfig;
}

describe("HeadersUtils", () => {
  afterEach(() => vi.unstubAllGlobals());

  describe("addAuthorizationHeader", () => {
    beforeEach(() => installLocalStorage());

    it("attaches Bearer token when token is stored", () => {
      persistAccessToken("tok123", "MAIN");
      const config = makeConfig();
      HeadersUtils.addAuthorizationHeader(config, "MAIN");
      expect(config.headers.authorization).toBe("Bearer tok123");
    });

    it("does not set authorization header when no token", () => {
      const config = makeConfig();
      HeadersUtils.addAuthorizationHeader(config, "MAIN");
      expect(config.headers.authorization).toBeUndefined();
    });
  });

  describe("SSR guard — no authorization header on server", () => {
    beforeEach(() => simulateServerEnvironment());

    it("returns no authorization header when window is absent", () => {
      const config = makeConfig();
      HeadersUtils.addAuthorizationHeader(config, "MAIN");
      // getAccessToken returns null on server → no header attached
      expect(config.headers.authorization).toBeUndefined();
    });
  });
});
