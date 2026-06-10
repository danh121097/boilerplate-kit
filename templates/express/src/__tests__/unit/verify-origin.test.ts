import { createVerifyOrigin } from '@/middleware/verify-origin';
import { AppError } from '@/types';
import { describe, it, expect, vi } from 'vitest';

const ALLOW = ['https://app.example.com'];

function reqOf(method: string, headers: Record<string, string> = {}) {
  return { method, headers } as any;
}

describe('verifyOrigin (CSRF Origin allow-list)', () => {
  const res = {} as any;

  it('passes through when CSRF is disabled (default off — no behavior change)', () => {
    const next = vi.fn();
    const mw = createVerifyOrigin({ enabled: false, allowList: ALLOW });
    mw(reqOf('POST', { origin: 'https://evil.com' }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('lets safe methods through even when enabled', () => {
    const next = vi.fn();
    const mw = createVerifyOrigin({ enabled: true, allowList: ALLOW });
    mw(reqOf('GET', {}), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a mutating request from an allow-listed Origin', () => {
    const next = vi.fn();
    const mw = createVerifyOrigin({ enabled: true, allowList: ALLOW });
    mw(reqOf('POST', { origin: 'https://app.example.com' }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a mutating request from a foreign Origin', () => {
    const mw = createVerifyOrigin({ enabled: true, allowList: ALLOW });
    expect(() => mw(reqOf('PATCH', { origin: 'https://evil.com' }), res, vi.fn())).toThrow(AppError);
  });

  it('rejects a mutating request with no Origin and no Referer', () => {
    const mw = createVerifyOrigin({ enabled: true, allowList: ALLOW });
    expect(() => mw(reqOf('DELETE', {}), res, vi.fn())).toThrow(AppError);
  });

  it('falls back to Referer origin when Origin header is absent', () => {
    const next = vi.fn();
    const mw = createVerifyOrigin({ enabled: true, allowList: ALLOW });
    mw(reqOf('PUT', { referer: 'https://app.example.com/some/page' }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects when Referer is not a parseable URL', () => {
    const mw = createVerifyOrigin({ enabled: true, allowList: ALLOW });
    expect(() => mw(reqOf('POST', { referer: 'not a url' }), res, vi.fn())).toThrow(AppError);
  });
});
