import { logger, serializeMeta } from "@/utils/logger";
import { describe, it, expect } from "vitest";

describe("logger.serializeMeta", () => {
  it("redacts sensitive keys (password, token, secret, cookie, authorization)", () => {
    const out = serializeMeta({
      password: "hunter2",
      accessToken: "eyJ...",
      refreshToken: "eyJ...",
      hmacSecret: "s3cr3t",
      cookie: "accessToken=abc",
      authorization: "Bearer x",
      userId: "u1", // not sensitive
    });
    expect(out.password).toBe("[REDACTED]");
    expect(out.accessToken).toBe("[REDACTED]");
    expect(out.refreshToken).toBe("[REDACTED]");
    expect(out.hmacSecret).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.userId).toBe("u1"); // passthrough
  });

  it("serializes Error values (message + stack survive JSON)", () => {
    const out = serializeMeta({ err: new TypeError("boom") });
    const err = out.err as { name: string; message: string; stack?: string };
    expect(err.name).toBe("TypeError");
    expect(err.message).toBe("boom");
    expect(typeof err.stack).toBe("string");
    // sanity: a plain Error would have stringified to {}
    expect(JSON.stringify(out)).toContain("boom");
  });

  it("passes non-sensitive primitives through unchanged", () => {
    expect(serializeMeta({ port: 3000, ok: true })).toEqual({ port: 3000, ok: true });
  });

  it("exposes level methods (silent in test env, no throw)", () => {
    expect(() => {
      logger.debug("d");
      logger.info("i", { port: 3000 });
      logger.warn("w");
      logger.error("e", { err: new Error("x") });
    }).not.toThrow();
  });
});
