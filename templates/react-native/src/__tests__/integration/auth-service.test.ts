import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { AuthModel } from "@/services/auth";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
} from "@/services/core/auth-token-storage";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

/**
 * AuthModel is tested against a stubbed `api` (the response interceptor already
 * unwraps the backend envelope, so the stub resolves to the envelope body and the
 * model reads `.data` once). Verifies token lifecycle + payload mapping against
 * async SecureStore.
 */

const RESULT = {
  user: { _id: "u1", email: "a@b.com", name: "A", role: "user" },
  tokens: { accessToken: "AT", refreshToken: "RT" },
};

describe("AuthModel", () => {
  beforeEach(() => resetSecureStore());
  afterEach(() => jest.restoreAllMocks());

  it("login persists the access token and returns the result", async () => {
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(res).toEqual(RESULT);
    expect(await getAccessToken("MAIN")).toBe("AT");
  });

  it("login persists the refresh token when the server returns one", async () => {
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(await getRefreshToken("MAIN")).toBe("RT");
  });

  it("login does not persist refresh token when server omits it", async () => {
    const resultNoRefresh = { ...RESULT, tokens: { accessToken: "AT" } };
    jest
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true, data: resultNoRefresh } as never);
    await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(await getRefreshToken("MAIN")).toBeNull();
  });

  it("register persists the access token and returns the result", async () => {
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    const res = await AuthModel.register({ email: "a@b.com", password: "x", name: "A" });
    expect(res.user._id).toBe("u1");
    expect(await getAccessToken("MAIN")).toBe("AT");
  });

  it("logout clears the stored token", async () => {
    await persistAccessToken("AT", "MAIN");
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();
    expect(await getAccessToken("MAIN")).toBeNull();
  });

  it("logout still clears the token even if the request fails", async () => {
    await persistAccessToken("AT", "MAIN");
    jest.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));
    await expect(AuthModel.logout()).rejects.toThrow("network");
    expect(await getAccessToken("MAIN")).toBeNull();
  });

  it("getMe returns the unwrapped user", async () => {
    jest
      .spyOn(AuthModel.api, "get")
      .mockResolvedValue({ success: true, data: { user: RESULT.user } } as never);
    const user = await AuthModel.getMe();
    expect(user).toEqual(RESULT.user);
  });
});
