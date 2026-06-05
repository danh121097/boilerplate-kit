import { installLocalStorage } from "../helpers/fake-storage";
import {
  clearAuthToken,
  clearAuthTokens,
  getAuthToken,
  persistAuthToken,
  registerServiceToken,
} from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("auth-token-storage", () => {
  beforeEach(() => {
    installLocalStorage();
    registerServiceToken("ADMIN", "ADMIN_TOKEN_SLOT");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns null when no token is stored", () => {
    expect(getAuthToken("MAIN")).toBeNull();
  });

  it("persists and reads a token per service", () => {
    persistAuthToken("main-tok", "MAIN");
    persistAuthToken("admin-tok", "ADMIN");
    expect(getAuthToken("MAIN")).toBe("main-tok");
    expect(getAuthToken("ADMIN")).toBe("admin-tok");
  });

  it("defaults to the MAIN service", () => {
    persistAuthToken("tok");
    expect(getAuthToken()).toBe("tok");
  });

  it("clearAuthToken removes ONLY the given service's token", () => {
    persistAuthToken("main-tok", "MAIN");
    persistAuthToken("admin-tok", "ADMIN");
    clearAuthToken("MAIN");
    expect(getAuthToken("MAIN")).toBeNull();
    expect(getAuthToken("ADMIN")).toBe("admin-tok"); // untouched
  });

  it("clearAuthTokens removes every registered service's token", () => {
    persistAuthToken("main-tok", "MAIN");
    persistAuthToken("admin-tok", "ADMIN");
    clearAuthTokens();
    expect(getAuthToken("MAIN")).toBeNull();
    expect(getAuthToken("ADMIN")).toBeNull();
  });

  it("falls back to the MAIN slot for an unregistered service", () => {
    persistAuthToken("main-tok", "MAIN");
    expect(getAuthToken("UNKNOWN")).toBe("main-tok"); // resolves to MAIN slot
  });
});
