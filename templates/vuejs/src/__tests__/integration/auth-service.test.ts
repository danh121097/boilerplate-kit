import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { AuthModel } from "@/services/auth";
import { getAccessToken, persistAccessToken } from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AuthModel is tested against a stubbed `api` (the response interceptor already
 * unwraps the backend envelope, so the stub resolves to the envelope body and
 * the model reads `.data` once). Verifies token lifecycle + payload mapping.
 */

const RESULT = {
  user: { _id: "u1", email: "a@b.com", name: "A", role: "user" },
  tokens: { accessToken: "AT", refreshToken: "RT" },
};

describe("AuthModel", () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("login persists the access token and returns the result", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(res).toEqual(RESULT);
    expect(getAccessToken("MAIN")).toBe("AT");
  });

  it("register persists the access token and returns the result", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.register({ email: "a@b.com", password: "x", name: "A" });
    expect(res.user._id).toBe("u1");
    expect(getAccessToken("MAIN")).toBe("AT");
  });

  it("logout clears the stored token", async () => {
    persistAccessToken("AT", "MAIN");
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(getAccessToken("MAIN")).toBeNull();
  });

  it("logout still clears the token even if the request fails", async () => {
    persistAccessToken("AT", "MAIN");
    vi.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));
    await expect(AuthModel.logout()).rejects.toThrow("network");
    expect(getAccessToken("MAIN")).toBeNull();
  });

  it("getMe returns the unwrapped user", async () => {
    vi.spyOn(AuthModel.api, "get").mockResolvedValue({ success: true, data: { user: RESULT.user } } as never);
    const user = await AuthModel.getMe();
    expect(user).toEqual(RESULT.user);
  });
});
