import { derivePath } from "@/common/guards/security.guard";
import { HmacService } from "@/common/services/hmac.service";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

/**
 * Unit tests for SecurityGuard helpers.
 *
 * derivePath — strips the apiPrefix and query string from req.originalUrl so the
 * signed path matches the client's path (which knows nothing about the server's
 * global prefix).
 *
 * HMAC byte-parity — builds a signature via HmacService and asserts that
 * verifyHmac accepts it, proving the signed-string construction is byte-identical
 * between compute and verify. A real AppConfigService would require Mongo/Redis
 * env; we supply a minimal stub.
 */

// ---------------------------------------------------------------------------
// Minimal AppConfigService stub — only hmacSecret needed for HMAC tests.
// ---------------------------------------------------------------------------
class StubConfigService {
  readonly hmacSecret = "test-secret-32-bytes-long-padded!";
  readonly apiPrefix = "/api/v1";
  readonly corsOrigins = ["http://localhost:5173"];
  readonly enableCsrf = false;
  readonly isTest = true;
}

// ---------------------------------------------------------------------------
// derivePath tests
// ---------------------------------------------------------------------------
describe("derivePath", () => {
  it("strips apiPrefix and query string from a typical auth path", () => {
    expect(derivePath("/api/v1/auth/login", "/api/v1")).toBe("/auth/login");
  });

  it("strips apiPrefix and query string when query string is present", () => {
    expect(derivePath("/api/v1/users?page=2", "/api/v1")).toBe("/users");
  });

  it("strips apiPrefix from /health (health is NOT exempt from HMAC)", () => {
    expect(derivePath("/api/v1/health", "/api/v1")).toBe("/health");
  });

  it("handles apiPrefix without leading slash", () => {
    // config.apiPrefix might be stored as "api/v1" without a leading slash.
    expect(derivePath("/api/v1/auth/register", "api/v1")).toBe("/auth/register");
  });

  it("returns original path (without query) when prefix not found", () => {
    // Defensive fallback — should not happen in normal operation.
    expect(derivePath("/other/path?q=1", "/api/v1")).toBe("/other/path");
  });

  it("handles a deeply nested path", () => {
    expect(derivePath("/api/v1/users/me/settings?locale=en", "/api/v1")).toBe(
      "/users/me/settings",
    );
  });
});

// ---------------------------------------------------------------------------
// HMAC byte-parity tests
// ---------------------------------------------------------------------------
describe("HmacService byte-parity (compute → verify roundtrip)", () => {
  /**
   * Build a real HmacService backed by a stub config and verify that a
   * signature produced by computeSignature is accepted by verifyHmac.
   * This catches any signed-string divergence between the two methods.
   */
  async function buildService(): Promise<HmacService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HmacService,
        { provide: "AppConfigService", useClass: StubConfigService },
        // HmacService injects AppConfigService directly — match the token.
        { provide: StubConfigService, useClass: StubConfigService },
      ],
    })
      .overrideProvider(HmacService)
      .useFactory({
        factory: () => new HmacService(new StubConfigService() as never),
      })
      .compile();

    return moduleRef.get(HmacService);
  }

  it("GET no-body: compute produces a sig that verifyHmac accepts", async () => {
    const svc = await buildService();
    const ctime = Date.now();
    const sig = svc.computeSignature({
      method: "GET",
      contentType: "",
      ctime,
      path: "/health",
    });

    const result = svc.verifyHmac({ method: "GET", contentType: "", ctime, path: "/health", sig });
    expect(result).toBeNull();
  });

  it("POST JSON: compute produces a sig that verifyHmac accepts", async () => {
    const svc = await buildService();
    const ctime = Date.now();
    const sig = svc.computeSignature({
      method: "POST",
      contentType: "application/json",
      ctime,
      path: "/auth/login",
    });

    const result = svc.verifyHmac({
      method: "POST",
      contentType: "application/json",
      ctime,
      path: "/auth/login",
      sig,
    });
    expect(result).toBeNull();
  });

  it("query-string path: signature computed on path WITHOUT query string", async () => {
    const svc = await buildService();
    const ctime = Date.now();
    // The client signs the path without the query string.
    const path = "/users";
    const sig = svc.computeSignature({ method: "GET", contentType: "", ctime, path });

    // Guard derives the same path via derivePath("/api/v1/users?page=2", "/api/v1").
    const derivedPath = derivePath("/api/v1/users?page=2", "/api/v1");
    expect(derivedPath).toBe(path);

    const result = svc.verifyHmac({ method: "GET", contentType: "", ctime, path: derivedPath, sig });
    expect(result).toBeNull();
  });

  it("verifyHmac rejects a tampered signature", async () => {
    const svc = await buildService();
    const ctime = Date.now();
    const sig = svc.computeSignature({ method: "GET", contentType: "", ctime, path: "/health" });

    // Tamper: flip the last character.
    const tampered = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    const result = svc.verifyHmac({
      method: "GET",
      contentType: "",
      ctime,
      path: "/health",
      sig: tampered,
    });
    expect(result).not.toBeNull();
  });

  it("verifyHmac rejects an expired timestamp", async () => {
    const svc = await buildService();
    // 6 minutes in the past — beyond the 5-minute window.
    const ctime = Date.now() - 6 * 60 * 1000;
    const sig = svc.computeSignature({ method: "GET", contentType: "", ctime, path: "/health" });

    const result = svc.verifyHmac({ method: "GET", contentType: "", ctime, path: "/health", sig });
    expect(result).toBe("timestamp expired");
  });
});
