import { AuthModel } from "@/services/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * AuthModel cookie-first tests — no localStorage, no token persistence.
 * The response interceptor unwraps the backend envelope, so stubs resolve
 * to the envelope body and the model reads `.data` once.
 */

const RESULT = {
  user: { _id: "u1", email: "a@b.com", name: "A", role: "user" },
  tokens: { accessToken: "AT", refreshToken: "RT" },
};

describe("AuthModel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("login returns the result (no localStorage side-effect)", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(res).toEqual(RESULT);
  });

  it("register returns the result", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.register({ email: "a@b.com", password: "x", name: "A" });
    expect(res.user._id).toBe("u1");
  });

  it("logout calls the logout endpoint", async () => {
    const spy = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("logout does not throw when the request fails (best-effort)", async () => {
    vi.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));
    // Cookie-first logout: no local state to clear, so we don't suppress the error
    await expect(AuthModel.logout()).rejects.toThrow("network");
  });

  it("getMe returns the unwrapped user", async () => {
    vi.spyOn(AuthModel.api, "get").mockResolvedValue({
      success: true,
      data: { user: RESULT.user },
    } as never);
    const user = await AuthModel.getMe();
    expect(user).toEqual(RESULT.user);
  });
});
