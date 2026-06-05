import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * makeStore() picks the backing store based on Redis availability: a RedisStore
 * when a client exists, undefined (→ MemoryStore) when Redis is off.
 */

const getRedisMock = vi.fn();
vi.mock('@/config/redis', () => ({ getRedis: () => getRedisMock() }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetModules());

describe('makeStore', () => {
  it('returns undefined when Redis is disabled (MemoryStore fallback)', async () => {
    getRedisMock.mockReturnValue(null);
    const { makeStore } = await import('@/middleware/rate-limit');

    expect(makeStore('rl:test:')).toBeUndefined();
  });

  it('returns a RedisStore when a Redis client is present', async () => {
    // call() must resolve a value: express-rate-limit auto-inits each limiter's
    // store (SCRIPT LOAD via call), and an undefined reply would reject.
    getRedisMock.mockReturnValue({ call: vi.fn(async () => 'sha') });
    const { makeStore } = await import('@/middleware/rate-limit');
    const { RedisStore } = await import('rate-limit-redis');

    expect(makeStore('rl:test:')).toBeInstanceOf(RedisStore);
  });
});
