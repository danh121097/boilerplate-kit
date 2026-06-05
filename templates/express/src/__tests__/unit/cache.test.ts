import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cache helpers must no-op when Redis is off, round-trip JSON when on, and fail
 * open (never throw) when the client errors or stores malformed JSON.
 */

const getRedisMock = vi.fn();
vi.mock('@/config/redis', () => ({ getRedis: () => getRedisMock() }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetModules());

describe('cache helpers — disabled', () => {
  it('cacheGet returns null and set/del are safe no-ops', async () => {
    getRedisMock.mockReturnValue(null);
    const { cacheGet, cacheSet, cacheDel } = await import('@/utils/cache');

    expect(await cacheGet('k')).toBeNull();
    await expect(cacheSet('k', { a: 1 }, 60)).resolves.toBeUndefined();
    await expect(cacheDel('k')).resolves.toBeUndefined();
  });
});

describe('cache helpers — enabled', () => {
  it('round-trips an object through set/get and deletes it', async () => {
    const store = new Map<string, string>();
    getRedisMock.mockReturnValue({
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return 'OK';
      }),
      del: vi.fn(async (k: string) => store.delete(k))
    });
    const { cacheGet, cacheSet, cacheDel } = await import('@/utils/cache');

    await cacheSet('user:1', { id: 1, name: 'a' }, 60);
    expect(await cacheGet<{ id: number }>('user:1')).toEqual({
      id: 1,
      name: 'a'
    });

    await cacheDel('user:1');
    expect(await cacheGet('user:1')).toBeNull();
  });

  it('cacheGet returns null on malformed JSON instead of throwing', async () => {
    getRedisMock.mockReturnValue({ get: vi.fn(async () => 'not-json{') });
    const { cacheGet } = await import('@/utils/cache');

    expect(await cacheGet('bad')).toBeNull();
  });

  it('fails open when the client throws', async () => {
    getRedisMock.mockReturnValue({
      get: vi.fn(async () => {
        throw new Error('conn refused');
      }),
      set: vi.fn(async () => {
        throw new Error('conn refused');
      }),
      del: vi.fn(async () => {
        throw new Error('conn refused');
      })
    });
    const { cacheGet, cacheSet, cacheDel } = await import('@/utils/cache');

    expect(await cacheGet('k')).toBeNull();
    await expect(cacheSet('k', 1, 60)).resolves.toBeUndefined();
    await expect(cacheDel('k')).resolves.toBeUndefined();
  });
});
