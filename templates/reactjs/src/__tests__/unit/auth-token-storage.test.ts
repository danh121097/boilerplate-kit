import { installLocalStorage } from "../helpers/fake-storage";
import {
  clearAuthTokens,
  clearServiceTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
  registerServiceToken,
} from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("auth-token-storage", () => {
  beforeEach(() => {
    installLocalStorage();
    registerServiceToken("ADMIN", { access: "ADMIN_ACCESS", refresh: "ADMIN_REFRESH" });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns null when no token is stored", () => {
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  it("persists and reads access + refresh tokens per service", () => {
    persistAccessToken("main-a", "MAIN");
    persistRefreshToken("main-r", "MAIN");
    persistAccessToken("admin-a", "ADMIN");
    persistRefreshToken("admin-r", "ADMIN");
    expect(getAccessToken("MAIN")).toBe("main-a");
    expect(getRefreshToken("MAIN")).toBe("main-r");
    expect(getAccessToken("ADMIN")).toBe("admin-a");
    expect(getRefreshToken("ADMIN")).toBe("admin-r");
  });

  it("defaults to the MAIN service", () => {
    persistAccessToken("a");
    persistRefreshToken("r");
    expect(getAccessToken()).toBe("a");
    expect(getRefreshToken()).toBe("r");
  });

  it("clearServiceTokens removes BOTH tokens of ONLY the given service", () => {
    persistAccessToken("main-a", "MAIN");
    persistRefreshToken("main-r", "MAIN");
    persistAccessToken("admin-a", "ADMIN");
    clearServiceTokens("MAIN");
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
    expect(getAccessToken("ADMIN")).toBe("admin-a"); // untouched
  });

  it("clearAuthTokens removes every registered service's access + refresh tokens", () => {
    persistAccessToken("main-a", "MAIN");
    persistRefreshToken("main-r", "MAIN");
    persistAccessToken("admin-a", "ADMIN");
    persistRefreshToken("admin-r", "ADMIN");
    clearAuthTokens();
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
    expect(getAccessToken("ADMIN")).toBeNull();
    expect(getRefreshToken("ADMIN")).toBeNull();
  });

  it("falls back to the MAIN slots for an unregistered service", () => {
    persistAccessToken("main-a", "MAIN");
    expect(getAccessToken("UNKNOWN")).toBe("main-a"); // resolves to MAIN slot
  });
});
