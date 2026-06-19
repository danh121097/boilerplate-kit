/**
 * HMAC signing helper for supertest e2e tests.
 *
 * Replicates EXACTLY the algorithm used by HmacService.computeSignature +
 * the path derivation in SecurityGuard.derivePath so the test signer is
 * byte-identical to what the server expects.
 *
 * Canonical signed string (must match hmac.service.ts buildStringToSign):
 *   [METHOD.toUpperCase(), contentType, String(ctime), path, ""].join("\n")
 *   The trailing empty element produces a final newline.
 *
 * Path rule (must match security.guard.ts derivePath):
 *   The client signs the path WITHOUT the API prefix. The guard strips
 *   req.originalUrl's prefix (/api/v1) before comparing — so we sign "/auth/login",
 *   NOT "/api/v1/auth/login". Query strings are included in req.originalUrl but
 *   the guard strips them via `split("?")[0]` before comparing. We follow the same
 *   rule: pass path WITHOUT query string (stripped), but WITH query string only
 *   if you pass the full unprefixed path including "?foo=bar" — the guard strips it.
 *   Safest: always pass the path segment only (no query), matching guard behavior.
 *
 * Content-type rule (must match security.guard.ts checkHmac):
 *   POST/PUT/PATCH with JSON body → "application/json"
 *   GET / DELETE / no-body mutating requests → ""
 *   Socket handshake → "application/json" (special case — see signSocketHandshake)
 *
 * Usage:
 *   import { buildHmacHeaders, addBearerToken } from "./sign-request";
 *
 *   const headers = buildHmacHeaders("POST", "/auth/login", someBody);
 *   supertest(app).post("/api/v1/auth/login").set(headers).send(body)
 *
 *   // Add JWT Bearer on top:
 *   const authed = addBearerToken(headers, accessToken);
 */

import crypto from "crypto";

const HMAC_SECRET = process.env.HMAC_SECRET ?? "test-hmac-secret-key-for-testing-min32chars";
const API_PREFIX = process.env.API_PREFIX ?? "/api/v1";

// ─── Core helpers ───────────────────────────────────────────────────────────

/**
 * Build the HMAC-SHA256 Base64 signature over the canonical string.
 * Matches HmacService.computeSignature byte-for-byte.
 */
function computeHmac(
  method: string,
  contentType: string,
  ctime: string,
  path: string,
): string {
  const stringToSign = [method.toUpperCase(), contentType, ctime, path, ""].join("\n");
  return crypto.createHmac("sha256", HMAC_SECRET).update(stringToSign).digest("base64");
}

/**
 * Derive the unprefixed path from a full URL (with or without prefix).
 * Mirrors SecurityGuard.derivePath exactly: strip prefix → ensure leading slash.
 * Query strings are stripped to match guard behavior.
 */
function derivePath(urlOrPath: string): string {
  // Strip query string first (guard does split("?")[0]).
  const withoutQuery = urlOrPath.split("?")[0];
  const prefix = API_PREFIX.startsWith("/") ? API_PREFIX : `/${API_PREFIX}`;
  if (withoutQuery.startsWith(prefix)) {
    const stripped = withoutQuery.slice(prefix.length);
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }
  // Already unprefixed (or no prefix present).
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface HmacHeaders {
  sig: string;
  ctime: string;
}

export interface AuthHeaders extends HmacHeaders {
  Authorization: string;
}

/**
 * Build `{ sig, ctime }` headers for a supertest request.
 *
 * @param method     HTTP method (GET, POST, …)
 * @param urlOrPath  Full URL ("/api/v1/auth/login") or unprefixed ("/auth/login").
 *                   Both forms work — the prefix is stripped automatically.
 * @param body       Request body (truthy → content-type "application/json"; falsy → "").
 *                   Pass undefined/null for GET or no-body requests.
 */
export function buildHmacHeaders(
  method: string,
  urlOrPath: string,
  body?: unknown,
): HmacHeaders {
  const ctime = Date.now().toString();
  const path = derivePath(urlOrPath);
  // Matches guard: raw content-type header or "" when absent. For tests sending
  // JSON bodies supertest sets "application/json"; we mirror that here.
  const contentType = body != null ? "application/json" : "";
  const sig = computeHmac(method, contentType, ctime, path);
  return { sig, ctime };
}

/**
 * Extend HMAC headers with a Bearer Authorization header.
 * Use this for requests that need both HMAC + JWT (all non-@Public routes).
 */
export function addBearerToken(headers: HmacHeaders, accessToken: string): AuthHeaders {
  return { ...headers, Authorization: `Bearer ${accessToken}` };
}

/**
 * Build the signed headers for the Socket.IO HMAC handshake.
 * Fixed contract (mirrors the socket gateway + express socket helper):
 *   method="GET", contentType="application/json", path="/socket"
 */
export function signSocketHandshake(): HmacHeaders {
  const ctime = Date.now().toString();
  const sig = computeHmac("GET", "application/json", ctime, "/socket");
  return { sig, ctime };
}

/**
 * Sign a request with a deliberately wrong signature (for negative tests).
 * Returns valid HMAC headers except `sig` is tampered.
 */
export function buildBadSignatureHeaders(
  method: string,
  urlOrPath: string,
  body?: unknown,
): HmacHeaders {
  const valid = buildHmacHeaders(method, urlOrPath, body);
  // Flip last byte of the base64 signature to produce a valid-format but wrong sig.
  const tampered =
    valid.sig.slice(0, -1) + (valid.sig.endsWith("A") ? "B" : "A");
  return { ...valid, sig: tampered };
}

/**
 * Build HMAC headers with an expired ctime (outside the 5-minute window).
 * Used to assert timestamp-expiry rejection.
 */
export function buildExpiredHmacHeaders(
  method: string,
  urlOrPath: string,
  body?: unknown,
): HmacHeaders {
  const expiredCtime = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
  const path = derivePath(urlOrPath);
  const contentType = body != null ? "application/json" : "";
  const sig = computeHmac(method, contentType, expiredCtime, path);
  return { sig, ctime: expiredCtime };
}
