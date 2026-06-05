import { describe, expect, it } from 'vitest';
import { computeSignature, verifyHmac } from '@/utils/hmac';

/**
 * Core HMAC verify: Base64 signature, timestamp freshness, constant-time compare.
 */

const base = {
  method: 'GET',
  contentType: 'application/json',
  path: '/socket'
};

function validSig(ctime: number): string {
  return computeSignature({ ...base, ctime });
}

describe('verifyHmac', () => {
  it('returns null for a fresh, correct signature', () => {
    const ctime = Date.now();
    expect(verifyHmac({ ...base, ctime, sig: validSig(ctime) })).toBeNull();
  });

  it('rejects a missing signature', () => {
    expect(verifyHmac({ ...base, ctime: Date.now(), sig: '' })).toBe(
      'missing signature'
    );
  });

  it('rejects a non-numeric timestamp', () => {
    expect(
      verifyHmac({ ...base, ctime: 'nope', sig: validSig(Date.now()) })
    ).toBe('invalid timestamp');
  });

  it('rejects an expired timestamp', () => {
    const old = Date.now() - 10 * 60 * 1000; // 10 min ago
    expect(verifyHmac({ ...base, ctime: old, sig: validSig(old) })).toBe(
      'timestamp expired'
    );
  });

  it('rejects a wrong-length signature', () => {
    const ctime = Date.now();
    expect(verifyHmac({ ...base, ctime, sig: 'AAAA' })).toBe(
      'invalid signature format'
    );
  });

  it('rejects a valid-length but incorrect signature', () => {
    const ctime = Date.now();
    const wrong = computeSignature({ ...base, ctime, path: '/other' });
    expect(verifyHmac({ ...base, ctime, sig: wrong })).toBe('invalid signature');
  });
});
