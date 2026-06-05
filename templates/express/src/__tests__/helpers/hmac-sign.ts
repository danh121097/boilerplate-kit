import crypto from 'crypto';
import { config } from '@/config/environment';

const HMAC_SECRET =
  process.env.HMAC_SECRET || 'test-hmac-secret-key-for-testing-min32chars';

/**
 * Generate HMAC headers for test requests, matching the frontend contract:
 *   stringToSign = [method, contentType, ctime, path, ''].join('\n')
 *   sig = Base64(HMAC-SHA256(stringToSign, secret))
 * - path is signed WITHOUT the /api/v1 prefix (client signs config.url, which is
 *   relative to baseURL); we strip the prefix from the full test URL.
 * - contentType mirrors the raw header: 'application/json' when a JSON body is
 *   sent, '' otherwise (matches the server reading req Content-Type || '').
 */
export function signHmac(
  method: string,
  url: string,
  body?: unknown
): { sig: string; ctime: string } {
  const ctime = Date.now().toString();
  const path = url.startsWith(config.apiPrefix)
    ? url.slice(config.apiPrefix.length) || '/'
    : url;
  const contentType = body ? 'application/json' : '';
  const stringToSign = [
    method.toUpperCase(),
    contentType,
    ctime,
    path,
    ''
  ].join('\n');

  const sig = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(stringToSign)
    .digest('base64');

  return { sig, ctime };
}

/**
 * Sign the fixed socket handshake contract (mirrors the client signHeader):
 *   ['GET', 'application/json', ctime, '/socket', ''].join('\n')
 */
export function signSocketHmac(): { sig: string; ctime: string } {
  const ctime = Date.now().toString();
  const stringToSign = ['GET', 'application/json', ctime, '/socket', ''].join(
    '\n'
  );
  const sig = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(stringToSign)
    .digest('base64');
  return { sig, ctime };
}
