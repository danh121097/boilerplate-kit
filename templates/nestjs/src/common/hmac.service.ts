import { AppConfigService } from "@/config/app-config.service";
import { Injectable } from "@nestjs/common";
import crypto from "crypto";

/**
 * HMAC request-signing helpers — ported from express utils/hmac.ts verbatim.
 *
 * Canonical signed string (MUST match client exactly):
 *   [METHOD.toUpperCase(), contentType, String(ctime), path, ""].join("\n")
 * The trailing empty element yields a final newline.
 *
 * HTTP requests: pass the raw `content-type` header value or `""` when absent.
 *   NEVER default to DEFAULT_CONTENT_TYPE for HTTP — that constant is socket-only.
 * Socket handshake: use DEFAULT_CONTENT_TYPE + SOCKET_HMAC_PATH.
 *
 * Signature: HMAC-SHA256 Base64-encoded (matches CryptoJS Base64.stringify(HmacSHA256(...))).
 */

/** Maximum age of a request timestamp (5 minutes) to prevent replay attacks. */
export const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/** Default content type used only for Socket.IO handshake signing (not HTTP). */
export const DEFAULT_CONTENT_TYPE = "application/json";

/** Fixed path signed for a Socket.IO handshake (no volatile query string). */
export const SOCKET_HMAC_PATH = "/socket";

export interface HmacParts {
  method: string;
  contentType: string;
  ctime: string | number;
  path: string;
  /** Base64 signature provided by the client. */
  sig: string;
}

@Injectable()
export class HmacService {
  constructor(private readonly config: AppConfigService) {}

  /**
   * Compute the HMAC-SHA256 Base64 signature for the given parts.
   * Used by HmacGuard (Phase 3) and the socket adapter (Phase 5) to verify requests.
   */
  computeSignature(p: Omit<HmacParts, "sig">): string {
    const stringToSign = buildStringToSign(p);
    return crypto
      .createHmac("sha256", this.config.hmacSecret)
      .update(stringToSign)
      .digest("base64");
  }

  /**
   * Verify an HMAC signature: checks timestamp freshness then does a constant-time
   * compare of the Base64 signatures.
   * Returns null when valid, or a short reason string on failure.
   */
  verifyHmac(parts: HmacParts): string | null {
    if (!parts.sig) return "missing signature";

    // Number() (not parseInt) so "123abc" → NaN rather than 123.
    const requestTime =
      typeof parts.ctime === "number" ? parts.ctime : Number(parts.ctime);
    if (Number.isNaN(requestTime)) return "invalid timestamp";
    if (Math.abs(Date.now() - requestTime) > MAX_TIMESTAMP_AGE_MS) {
      return "timestamp expired";
    }

    const expectedBuf = Buffer.from(this.computeSignature(parts), "base64");
    const sigBuf = Buffer.from(parts.sig, "base64");
    if (sigBuf.length !== expectedBuf.length) return "invalid signature format";

    return crypto.timingSafeEqual(sigBuf, expectedBuf) ? null : "invalid signature";
  }
}

/**
 * Canonical string both client and server sign.
 * Trailing empty element produces a final newline — matches express exactly.
 */
function buildStringToSign(p: Omit<HmacParts, "sig">): string {
  return [p.method.toUpperCase(), p.contentType, String(p.ctime), p.path, ""].join("\n");
}
