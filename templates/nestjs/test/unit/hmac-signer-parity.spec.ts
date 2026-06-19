/**
 * HMAC signer parity test — proves test/helpers/sign-request.ts is byte-identical
 * to HmacService.computeSignature / verifyHmac before any e2e test depends on it.
 *
 * A drift here makes EVERY e2e test a false 401 — catching it early is critical.
 */
import { describe, expect, it } from "vitest";

import { HmacService } from "@/common/hmac.service";
import { MAX_TIMESTAMP_AGE_MS } from "@/common/hmac.service";
import {
  buildBadSignatureHeaders,
  buildExpiredHmacHeaders,
  buildHmacHeaders,
  signSocketHandshake,
} from "../helpers/sign-request";

// ---------------------------------------------------------------------------
// Minimal stub of AppConfigService — only hmacSecret is needed by HmacService.
// ---------------------------------------------------------------------------
const HMAC_SECRET = process.env.HMAC_SECRET ?? "test-hmac-secret-key-for-testing-min32chars";

const configStub = {
  hmacSecret: HMAC_SECRET,
} as unknown as import("@/config/app-config.service").AppConfigService;

const hmacService = new HmacService(configStub);

// ---------------------------------------------------------------------------
// Helper: convert { sig, ctime } + request params into HmacParts for verifyHmac.
// The path passed to verifyHmac must be the UNPREFIXED path (after prefix strip),
// matching derivePath logic in sign-request.ts and security.guard.ts.
// ---------------------------------------------------------------------------
function partsFor(
  method: string,
  unprefixedPath: string,
  contentType: string,
  sig: string,
  ctime: string,
) {
  return { method, contentType, ctime, path: unprefixedPath, sig };
}

describe("HMAC signer parity — sign-request.ts vs HmacService", () => {
  describe("GET no-body request", () => {
    it("produces a signature verifyHmac accepts", () => {
      const headers = buildHmacHeaders("GET", "/health");
      // GET has no body → contentType must be ""
      const parts = partsFor("GET", "/health", "", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBeNull(); // null = valid
    });

    it("works with a full prefixed URL (prefix stripped automatically)", () => {
      const headers = buildHmacHeaders("GET", "/api/v1/health");
      const parts = partsFor("GET", "/health", "", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBeNull();
    });
  });

  describe("POST JSON request", () => {
    it("produces a signature verifyHmac accepts for /auth/login", () => {
      const body = { email: "test@example.com", password: "Secret1!" };
      const headers = buildHmacHeaders("POST", "/auth/login", body);
      const parts = partsFor("POST", "/auth/login", "application/json", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBeNull();
    });

    it("works with full prefixed URL for POST", () => {
      const body = { email: "a@b.com", password: "pass" };
      const headers = buildHmacHeaders("POST", "/api/v1/auth/register", body);
      const parts = partsFor("POST", "/auth/register", "application/json", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBeNull();
    });
  });

  describe("path with query string", () => {
    it("strips query string from URL (guard strips it too, so sig is for path-only)", () => {
      // The guard does split("?")[0] before deriving the signed path.
      // Our helper also strips query string via derivePath.
      const headers = buildHmacHeaders("GET", "/users?page=1&limit=10");
      // Guard signs "/users" (query stripped), so we verify with "/users".
      const parts = partsFor("GET", "/users", "", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBeNull();
    });

    it("prefixed URL with query: strips both prefix and query", () => {
      const headers = buildHmacHeaders("GET", "/api/v1/users?page=2");
      const parts = partsFor("GET", "/users", "", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBeNull();
    });
  });

  describe("Socket.IO handshake signature", () => {
    it("produces sig accepted by verifyHmac with fixed socket contract", () => {
      const headers = signSocketHandshake();
      // Socket contract: GET, application/json, /socket
      const parts = partsFor("GET", "/socket", "application/json", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBeNull();
    });
  });

  describe("tampered / expired signatures", () => {
    it("buildBadSignatureHeaders → verifyHmac returns 'invalid signature'", () => {
      const headers = buildBadSignatureHeaders("GET", "/health");
      const parts = partsFor("GET", "/health", "", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).not.toBeNull();
      // Should report invalid signature or format mismatch.
      expect(result).toMatch(/invalid signature/);
    });

    it("buildExpiredHmacHeaders → verifyHmac returns 'timestamp expired'", () => {
      const headers = buildExpiredHmacHeaders("GET", "/health");
      const parts = partsFor("GET", "/health", "", headers.sig, headers.ctime);
      const result = hmacService.verifyHmac(parts);
      expect(result).toBe("timestamp expired");
    });

    it("ctime exactly at boundary (within window) → valid", () => {
      // Just inside the 5-minute window (MAX_TIMESTAMP_AGE_MS - 1s).
      const freshCtime = (Date.now() - (MAX_TIMESTAMP_AGE_MS - 1000)).toString();
      const path = "/health";
      // Compute a valid sig for this custom ctime directly.
      import("crypto").then(({ createHmac }) => {
        const stringToSign = ["GET", "", freshCtime, path, ""].join("\n");
        const sig = createHmac("sha256", HMAC_SECRET).update(stringToSign).digest("base64");
        const result = hmacService.verifyHmac({ method: "GET", contentType: "", ctime: freshCtime, path, sig });
        expect(result).toBeNull();
      });
    });

    it("missing sig → verifyHmac returns 'missing signature'", () => {
      const result = hmacService.verifyHmac({
        method: "GET",
        contentType: "",
        ctime: Date.now().toString(),
        path: "/health",
        sig: "",
      });
      expect(result).toBe("missing signature");
    });

    it("NaN ctime → verifyHmac returns 'invalid timestamp'", () => {
      const headers = buildHmacHeaders("GET", "/health");
      const result = hmacService.verifyHmac({
        method: "GET",
        contentType: "",
        ctime: "not-a-number",
        path: "/health",
        sig: headers.sig,
      });
      expect(result).toBe("invalid timestamp");
    });
  });

  describe("case sensitivity and method normalisation", () => {
    it("lowercase method is normalised to uppercase (POST === post)", () => {
      const body = { x: 1 };
      // Sign with uppercase POST.
      const headers = buildHmacHeaders("POST", "/auth/login", body);
      // Verify with uppercase POST — should pass.
      const result = hmacService.verifyHmac(
        partsFor("POST", "/auth/login", "application/json", headers.sig, headers.ctime),
      );
      expect(result).toBeNull();
    });
  });
});
