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
    "rejects %s without an allow-listed origin",
    (method) => {
      expect(() => assertAllowedOrigin(req(method), config)).toThrow(AppException);
      expect(() =>
        assertAllowedOrigin(req(method, { origin: "http://evil.example" }), config),
      ).toThrow(AppException);
    },
  );

  it("accepts a non-safe method from an allow-listed Origin or Referer", () => {
    expect(() =>
      assertAllowedOrigin(req("POST", { origin: "http://localhost:5173" }), config),
    ).not.toThrow();
    expect(() =>
      assertAllowedOrigin(req("DELETE", { referer: "http://localhost:5173/page" }), config),
    ).not.toThrow();
  });
});
