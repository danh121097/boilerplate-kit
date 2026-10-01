import { AppException } from "@/common/exceptions/app.exception";
import { assertAllowedOrigin } from "@/common/guards/origin-check";
import { describe, expect, it } from "vitest";
import type { Request } from "express";

const config = { enableCsrf: true, corsOrigins: ["http://localhost:5173"] };

function req(method: string, headers: Record<string, string> = {}): Request {
  return { method, headers } as unknown as Request;
}

describe("assertAllowedOrigin", () => {
  it("skips the check when CSRF protection is off", () => {
    expect(() => assertAllowedOrigin(req("POST"), { ...config, enableCsrf: false })).not.toThrow();
  });

  it.each(["GET", "HEAD", "OPTIONS"])("lets %s through without an origin", (method) => {
    expect(() => assertAllowedOrigin(req(method), config)).not.toThrow();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "PROPFIND"])(
    "rejects %s from a disallowed Origin",
    (method) => {
      expect(() =>
        assertAllowedOrigin(req(method, { origin: "http://evil.example" }), config),
      ).toThrow(AppException);
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE", "PROPFIND"])(
    "lets %s through when it carries no Cookie, Origin or Referer (native client)",
    (method) => {
      expect(() => assertAllowedOrigin(req(method), config)).not.toThrow();
    },
  );

  it("rejects a non-safe method with a Cookie but no Origin or Referer", () => {
    expect(() => assertAllowedOrigin(req("POST", { cookie: "refreshToken=abc" }), config)).toThrow(
      AppException,
    );
  });

  it("does not treat a malformed Referer as an absent one", () => {
    expect(() => assertAllowedOrigin(req("POST", { referer: "not a url" }), config)).toThrow(
      AppException,
    );
  });

  it("accepts a non-safe method from an allow-listed Origin or Referer", () => {
    expect(() =>
      assertAllowedOrigin(req("POST", { origin: "http://localhost:5173" }), config),
    ).not.toThrow();
    expect(() =>
      assertAllowedOrigin(req("DELETE", { referer: "http://localhost:5173/page" }), config),
    ).not.toThrow();
  });
});
