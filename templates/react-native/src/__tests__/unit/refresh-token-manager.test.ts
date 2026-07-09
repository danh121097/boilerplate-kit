import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { getAccessToken, persistAccessToken } from "@/services/core/auth-token-storage";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("RefreshTokenManager", () => {
  beforeEach(() => resetSecureStore());

  it("dedupes concurrent calls into a single refresh and persists the token", async () => {
    let runs = 0;
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        runs += 1;
        await tick();
        return `T${runs}`;
      },
      onRefreshFailed: () => {},
    });

    const [a, b, c] = await Promise.all([
      mgr.getFreshToken(),
      mgr.getFreshToken(),
      mgr.getFreshToken(),
    ]);

    expect(runs).toBe(1); // single-flight
    expect([a, b, c]).toEqual(["T1", "T1", "T1"]);
    expect(await getAccessToken("MAIN")).toBe("T1"); // persisted
  });

  it("refreshes again after the in-flight one settles", async () => {
    let runs = 0;
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => `T${++runs}`,
      onRefreshFailed: () => {},
    });

    expect(await mgr.getFreshToken()).toBe("T1");
    expect(await mgr.getFreshToken()).toBe("T2");
    expect(runs).toBe(2);
  });

  it("clears the service token and fires onRefreshFailed when refresh rejects", async () => {
    await persistAccessToken("OLD", "MAIN");
    const onRefreshFailed = jest.fn();
    const mgr = new RefreshTokenManager({
      service: "MAIN",
      refresh: async () => {
        throw new Error("refresh failed");
      },
      onRefreshFailed,
    });

    await expect(mgr.getFreshToken()).rejects.toThrow("refresh failed");
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    expect(await getAccessToken("MAIN")).toBeNull(); // cleared
  });
});
