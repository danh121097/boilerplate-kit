import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { Api, createTokenRefresher, persistRefreshToken } from "@/services/core";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/** Mirror of the Express verifier: it signs the raw Content-Type header it received. */
function serverSign(
  secret: string,
  method: string,
  contentType: string,
  ctime: string,
  path: string,
) {
  const stringToSign = [method.toUpperCase(), contentType, ctime, path, ""].join("\n");
  return createHmac("sha256", secret).update(stringToSign).digest("base64");
}

describe("createTokenRefresher — HMAC", () => {
  beforeEach(() => {
    installLocalStorage();
    vi.stubEnv("VITE_HMAC_SECRET", "shared-secret");
    Api.setBaseURL("http://api.test/api/v1", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("signs the Content-Type the refresh request actually sends", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { success: true, data: { tokens: { accessToken: "AT2", refreshToken: "RT2" } } },
    } as never);

    const tokens = await createTokenRefresher("/auth/refresh", "MAIN")();

    expect(tokens).toEqual({ accessToken: "AT2", refreshToken: "RT2" });
    const [url, body, config] = post.mock.calls[0]!;
    const headers = config!.headers as Record<string, string | number>;
    expect(url).toBe("http://api.test/api/v1/auth/refresh");
    expect(body).toEqual({ refreshToken: "RT" });
    // The server recomputes over the header it receives; a body is sent, so it is JSON.
    expect(headers["Content-Type"]).toBe("application/json");
    const expected = serverSign(
      "shared-secret",
      "POST",
      String(headers["Content-Type"]),
      String(headers.ctime),
      "/auth/refresh",
    );
    expect(headers.sig).toBe(expected);
  });
});
