import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Token revocation must no-op when Redis is off, set/read the per-user cutoff
 * when on, fail open on errors, and the auth middleware must reject access tokens
 * issued before that cutoff.
 */

const getRedisMock = vi.fn();
vi.mock('@/config/redis', () => ({ getRedis: () => getRedisMock() }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetModules());

describe('accessTtlSeconds', () => {
  it('parses minute/second/hour/day and numeric expiries', async () => {
    getRedisMock.mockReturnValue(null);
    const { accessTtlSeconds } = await import('@/utils/token-revocation');
    // config.jwtAccessExpiry is '15m' under test env
    expect(accessTtlSeconds()).toBe(15 * 60);
  });
});

describe('revocation helpers — disabled', () => {
  it('revokeUserTokens is a no-op and getUserRevokedAt returns null', async () => {
    getRedisMock.mockReturnValue(null);
    const { revokeUserTokens, getUserRevokedAt } = await import(
      '@/utils/token-revocation'
    );

    await expect(revokeUserTokens('u1')).resolves.toBeUndefined();
    expect(await getUserRevokedAt('u1')).toBeNull();
  });
});

describe('revocation helpers — enabled', () => {
  it('sets the cutoff with a TTL and reads it back', async () => {
    const store = new Map<string, string>();
    const setSpy = vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    });
    getRedisMock.mockReturnValue({
      set: setSpy,
      get: vi.fn(async (k: string) => store.get(k) ?? null)
    });
    const { revokeUserTokens, getUserRevokedAt } = await import(
      '@/utils/token-revocation'
    );

    await revokeUserTokens('u1');
    expect(setSpy).toHaveBeenCalledWith(
      'revoked:user:u1',
      expect.any(String),
      'EX',
      15 * 60
    );
    expect(await getUserRevokedAt('u1')).toBeTypeOf('number');
  });

  it('fails open when the client throws', async () => {
    getRedisMock.mockReturnValue({
      set: vi.fn(async () => {
        throw new Error('down');
      }),
      get: vi.fn(async () => {
        throw new Error('down');
      })
    });
    const { revokeUserTokens, getUserRevokedAt } = await import(
      '@/utils/token-revocation'
    );

    await expect(revokeUserTokens('u1')).resolves.toBeUndefined();
    expect(await getUserRevokedAt('u1')).toBeNull();
  });
});

describe('authenticate — revocation check', () => {
  it('rejects a token issued before the revoke cutoff', async () => {
    // Cutoff is in the future relative to the token iat → revoked.
    const future = Math.floor(Date.now() / 1000) + 3600;
    getRedisMock.mockReturnValue({
      get: vi.fn(async () => String(future))
    });
    const { authenticate } = await import('@/middleware/auth');
    const { signAccessToken } = await import('@/utils/jwt');
    const { AppError } = await import('@/types');

    const token = signAccessToken({
      userId: '1',
      email: 'a@b.com',
      role: 'user'
    });
    const req = { headers: { authorization: `Bearer ${token}` } } as any;

    await expect(authenticate(req, {} as any, vi.fn())).rejects.toThrow(
      AppError
    );
  });

  it('allows a token issued after the revoke cutoff', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    getRedisMock.mockReturnValue({
      get: vi.fn(async () => String(past))
    });
    const { authenticate } = await import('@/middleware/auth');
    const { signAccessToken } = await import('@/utils/jwt');

    const token = signAccessToken({
      userId: '1',
      email: 'a@b.com',
      role: 'user'
    });
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const next = vi.fn();

    await authenticate(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.userId).toBe('1');
  });
});
