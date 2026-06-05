import { config } from '@/config/environment';
import crypto from 'crypto';

/** Maximum age of a request timestamp (5 minutes) to prevent replay attacks. */
export const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/** Default content type used when a request carries none (matches the client). */
export const DEFAULT_CONTENT_TYPE = 'application/json';

/** Fixed path the client signs for a Socket.IO handshake (no volatile query). */
export const SOCKET_HMAC_PATH = '/socket';

export interface HmacParts {
  method: string;
  contentType: string;
  /** ctime — epoch millis as sent by the client (string or number). */
  ctime: string | number;
  path: string;
  /** Base64 signature provided by the client. */
  sig: string;
}

/**
 * Canonical string the client and server both sign. The trailing empty element
 * yields a final newline — it MUST match the client exactly:
 *   [method, contentType, ctime, path, ""].join("\n")
 */
function buildStringToSign(p: Omit<HmacParts, 'sig'>): string {
  return [p.method.toUpperCase(), p.contentType, String(p.ctime), p.path, ''].join(
    '\n'
  );
}

/**
 * Compute the HMAC-SHA256 signature, Base64-encoded to match the client
 * (CryptoJS `Base64.stringify(HmacSHA256(stringToSign, secret))`).
 */
export function computeSignature(p: Omit<HmacParts, 'sig'>): string {
  return crypto
    .createHmac('sha256', config.hmacSecret)
    .update(buildStringToSign(p))
    .digest('base64');
}

/**
 * Verify an HMAC signature: timestamp freshness and a constant-time compare of
 * the Base64 signatures. Returns null when valid, or a short reason otherwise.
 */
export function verifyHmac(parts: HmacParts): string | null {
  if (!parts.sig) return 'missing signature';

  // Number() (not parseInt) so "123abc" → NaN rather than 123.
  const requestTime =
    typeof parts.ctime === 'number' ? parts.ctime : Number(parts.ctime);
  if (Number.isNaN(requestTime)) return 'invalid timestamp';
  if (Math.abs(Date.now() - requestTime) > MAX_TIMESTAMP_AGE_MS) {
    return 'timestamp expired';
  }

  const expectedBuf = Buffer.from(computeSignature(parts), 'base64');
  const sigBuf = Buffer.from(parts.sig, 'base64');
  if (sigBuf.length !== expectedBuf.length) return 'invalid signature format';

  return crypto.timingSafeEqual(sigBuf, expectedBuf) ? null : 'invalid signature';
}
