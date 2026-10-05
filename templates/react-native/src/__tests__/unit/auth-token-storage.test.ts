import { resetStorage } from "@/__tests__/helpers/fake-storage";
import { STORAGE_KEYS } from "@/enums";
import {
  clearAccessToken,
  clearAuthTokens,
  clearRefreshToken,
  clearServiceTokens,
  getAccessToken,
  getRefreshToken,
  onTokensChanged,
  persistAccessToken,
  persistRefreshedTokensIfCurrent,
  persistRefreshToken,
  registerServiceToken,
} from "@/services/core/auth-token-storage";
import { getSessionEpoch, hasStoredSession } from "@/services/core/session";

describe("auth-token-storage (async / encrypted MMKV)", () => {
  beforeEach(() => {
    resetStorage();
    registerServiceToken("ADMIN", { access: "ADMIN_ACCESS", refresh: "ADMIN_REFRESH" });
  });

  it("returns null when no token is stored", async () => {
    expect(await getAccessToken("MAIN")).toBeNull();
    expect(await getRefreshToken("MAIN")).toBeNull();
  });

  it("fails closed for an unregistered service: never reads or touches the MAIN slots", async () => {
    await persistAccessToken("main-a", "MAIN");
    await persistRefreshToken("main-r", "MAIN");

    expect(await getAccessToken("UNKNOWN")).toBeNull();
    expect(await getRefreshToken("UNKNOWN")).toBeNull();
    await expect(persistAccessToken("x", "UNKNOWN")).rejects.toThrow(/registerServiceToken/);
    await expect(persistRefreshToken("x", "UNKNOWN")).rejects.toThrow(/registerServiceToken/);
    await expect(
      persistRefreshedTokensIfCurrent({ accessToken: "x" }, getSessionEpoch("UNKNOWN"), "UNKNOWN"),
    ).rejects.toThrow(/registerServiceToken/);

    await clearAccessToken("UNKNOWN");
    await clearRefreshToken("UNKNOWN");
    await clearServiceTokens("UNKNOWN");
    expect(await getAccessToken("MAIN")).toBe("main-a");
    expect(await getRefreshToken("MAIN")).toBe("main-r");
    expect(await hasStoredSession("UNKNOWN")).toBe(false);
  });

  it("persists and reads access + refresh tokens per service", async () => {
    await persistAccessToken("main-a", "MAIN");
    await persistRefreshToken("main-r", "MAIN");
    await persistAccessToken("admin-a", "ADMIN");
    await persistRefreshToken("admin-r", "ADMIN");
    expect(await getAccessToken("MAIN")).toBe("main-a");
    expect(await getRefreshToken("MAIN")).toBe("main-r");
    expect(await getAccessToken("ADMIN")).toBe("admin-a");
    expect(await getRefreshToken("ADMIN")).toBe("admin-r");
  });

  it("defaults to the MAIN service", async () => {
    await persistAccessToken("a");
    await persistRefreshToken("r");
    expect(await getAccessToken()).toBe("a");
    expect(await getRefreshToken()).toBe("r");
  });

  it("clearServiceTokens removes BOTH tokens of ONLY the given service", async () => {
    await persistAccessToken("main-a", "MAIN");
    await persistRefreshToken("main-r", "MAIN");
    await persistAccessToken("admin-a", "ADMIN");
    await clearServiceTokens("MAIN");
    expect(await getAccessToken("MAIN")).toBeNull();
    expect(await getRefreshToken("MAIN")).toBeNull();
    expect(await getAccessToken("ADMIN")).toBe("admin-a"); // untouched
  });

  it("clearAuthTokens removes every registered service's access + refresh tokens", async () => {
    await persistAccessToken("main-a", "MAIN");
    await persistRefreshToken("main-r", "MAIN");
    await persistAccessToken("admin-a", "ADMIN");
    await persistRefreshToken("admin-r", "ADMIN");
    await clearAuthTokens();
    expect(await getAccessToken("MAIN")).toBeNull();
    expect(await getRefreshToken("MAIN")).toBeNull();
    expect(await getAccessToken("ADMIN")).toBeNull();
    expect(await getRefreshToken("ADMIN")).toBeNull();
  });

  it("keeps STORAGE_KEYS values within [A-Za-z0-9._-]", () => {
    for (const value of Object.values(STORAGE_KEYS)) {
      expect(value).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });

  it("every clear bumps the cleared service's session epoch", async () => {
    const main = getSessionEpoch("MAIN");
    const admin = getSessionEpoch("ADMIN");
    const clearing = clearServiceTokens("MAIN");
    expect(getSessionEpoch("MAIN")).toBe(main + 1); // synchronously, before the delete
    await clearing;
    expect(getSessionEpoch("ADMIN")).toBe(admin);
    await clearAuthTokens();
    expect(getSessionEpoch("MAIN")).toBe(main + 2);
    expect(getSessionEpoch("ADMIN")).toBe(admin + 1);
  });

  it("notifies onTokensChanged after writes and clears, until unsubscribed", async () => {
    const changed = jest.fn();
    const unsubscribe = onTokensChanged(changed);
    await persistAccessToken("a", "MAIN");
    await clearServiceTokens("ADMIN");
    unsubscribe();
    await persistRefreshToken("r", "MAIN");
    expect(changed.mock.calls).toEqual([["MAIN"], ["ADMIN"]]);
  });

  it("hasStoredSession is true while either token is stored", async () => {
    expect(await hasStoredSession("MAIN")).toBe(false);
    await persistRefreshToken("r", "MAIN");
    expect(await hasStoredSession("MAIN")).toBe(true);
  });

  it("persistRefreshedTokensIfCurrent writes nothing once the epoch moved", async () => {
    const epoch = getSessionEpoch("MAIN");
    await clearServiceTokens("MAIN");
    expect(await persistRefreshedTokensIfCurrent({ accessToken: "late" }, epoch, "MAIN")).toBe(
      false,
    );
    expect(await getAccessToken("MAIN")).toBeNull();
  });
});
