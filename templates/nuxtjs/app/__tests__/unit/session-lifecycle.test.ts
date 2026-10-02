import { AuthModel } from "@/services/auth";
import {
  clearSessionHint,
  endSession,
  getSessionEpoch,
  hasSessionHint,
  markSessionActive,
  setSessionHintMaxAgeDays,
  startSession,
} from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The readable session hint cookie and the session lifecycle: set on login/register, cleared on logout
 * (even a failed one). `document.cookie` is stubbed as a plain string property.
 */

const RESULT = {
  user: { _id: "u1", email: "a@b.com", name: "A", role: "user" },
  tokens: { accessToken: "AT", refreshToken: "RT" },
};

describe("session hint", () => {
  let doc: { cookie: string };

  let storage: Map<string, string>;

  beforeEach(() => {
    doc = { cookie: "" };
    vi.stubGlobal("document", doc);
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
  });

  const lastBroadcast = () =>
    JSON.parse(storage.get("PRISM_APP_AUTH_SYNC") ?? "null") as { type: string } | null;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads, marks and clears the hint cookie", () => {
    expect(hasSessionHint()).toBe(false);
    markSessionActive();
    expect(doc.cookie).toMatch(/^PRISM_APP_SESSION=1; path=\/; max-age=\d+; SameSite=Lax$/);
    expect(hasSessionHint()).toBe(true);
    clearSessionHint();
    expect(doc.cookie).toContain("max-age=0");
    expect(hasSessionHint()).toBe(false);
  });

  it.each([
    [undefined, 7],
    [14, 14],
    ["30", 30],
    [0, 7],
    ["abc", 7],
    ["", 7],
  ])("hint max-age from runtime config %j → %d days", (config, days) => {
    setSessionHintMaxAgeDays(config);
    markSessionActive();
    expect(doc.cookie).toContain(`max-age=${days * 86400};`);
    setSessionHintMaxAgeDays(undefined);
  });

  it("finds the hint among other cookies", () => {
    doc.cookie = "PRISM_APP_LANGUAGE=en; PRISM_APP_SESSION=1";
    expect(hasSessionHint()).toBe(true);
  });

  it("login and register mark the session active", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true, data: RESULT } as never);
    await AuthModel.login({ email: "a@b.com", password: "x" });
    expect(hasSessionHint()).toBe(true);

    doc.cookie = "";
    await AuthModel.register({ email: "a@b.com", password: "x", name: "A" });
    expect(hasSessionHint()).toBe(true);
  });

  it("a failed login leaves no hint", async () => {
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 401, message: "bad" });
    await expect(AuthModel.login({ email: "a@b.com", password: "x" })).rejects.toBeTruthy();
    expect(hasSessionHint()).toBe(false);
  });

  it("logout clears the hint even when the request fails", async () => {
    doc.cookie = "PRISM_APP_SESSION=1";
    vi.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));
    await expect(AuthModel.logout()).rejects.toThrow("network");
    expect(hasSessionHint()).toBe(false);
  });

  it("clearing the hint alone does not end the session epoch", () => {
    const epoch = getSessionEpoch("MAIN");
    markSessionActive();
    clearSessionHint();
    expect(getSessionEpoch("MAIN")).toBe(epoch);
  });

  it("starting a session marks the hint and tells the other tabs", () => {
    startSession();
    expect(hasSessionHint()).toBe(true);
    expect(lastBroadcast()).toMatchObject({ type: "login" });
  });

  it("ending the main session bumps its epoch, drops the hint and tells the other tabs", () => {
    const epoch = getSessionEpoch("MAIN");
    markSessionActive();

    endSession("expired", "MAIN");

    expect(getSessionEpoch("MAIN")).toBe(epoch + 1);
    expect(hasSessionHint()).toBe(false);
    expect(lastBroadcast()).toMatchObject({ type: "logout" });
  });

  it("ending another service's session keeps the hint and broadcasts nothing", () => {
    const main = getSessionEpoch("MAIN");
    markSessionActive();

    endSession("expired", "ADMIN");

    expect(getSessionEpoch("MAIN")).toBe(main);
    expect(hasSessionHint()).toBe(true);
    expect(lastBroadcast()).toBeNull();
  });
});
