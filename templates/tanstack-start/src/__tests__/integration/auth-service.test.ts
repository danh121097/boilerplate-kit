import { AuthModel } from "@/services/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * AuthModel is tested against a stubbed `api` (the response interceptor already
 * unwraps the backend envelope, so the stub resolves to the envelope body and the
 * model reads `.data` once). Auth is cookie-based: the backend sets/clears the
 * httpOnly token cookies, so the model stores nothing — these tests verify it
 * calls the right endpoints and returns the mapped payload.
 */

const RESULT = {
  user: { _id: "u1", email: "a@b.com", name: "A", role: "user" },
  tokens: { accessToken: "AT", refreshToken: "RT" },
};

describe("AuthModel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("login posts to /auth/login and returns the result", async () => {
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(res).toEqual(RESULT);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: "/auth/login" }));
  });

  it("register posts to /auth/register and returns the result", async () => {
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.register({ email: "a@b.com", password: "x", name: "A" });
    expect(res.user._id).toBe("u1");
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: "/auth/register" }));
  });

  it("logout posts to /auth/logout (backend clears the cookies)", async () => {
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: "/auth/logout" }));
  });
});
