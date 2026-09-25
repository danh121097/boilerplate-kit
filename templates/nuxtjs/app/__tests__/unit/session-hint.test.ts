import { AuthModel } from "@/services/auth";
import { clearSessionHint, hasSessionHint, markSessionActive } from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The readable session-hint cookie: set on login/register, cleared on logout
 * (even a failed one). `document.cookie` is stubbed as a plain string property.
 */

const RESULT = {
  user: { _id: "u1", email: "a@b.com", name: "A", role: "user" },
  tokens: { accessToken: "AT", refreshToken: "RT" },
};

describe("session hint", () => {
  let doc: { cookie: string };

  beforeEach(() => {
    doc = { cookie: "" };
    vi.stubGlobal("document", doc);
  });

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
});
