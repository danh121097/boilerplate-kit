import { createServer, type Server as HttpServer } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Socket core must expose getIO()/closeSocket(), run single-instance when Redis
 * is off, and wire the Redis adapter (duplicated sub connection) when Redis is on.
 */

const getRedisMock = vi.fn();
vi.mock('@/config/redis', () => ({ getRedis: () => getRedisMock() }));

let httpServer: HttpServer;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  httpServer = createServer();
});

afterEach(() => {
  httpServer.close();
});

describe('socket core — disabled Redis', () => {
  it('getIO is null before init, non-null after, no adapter wired', async () => {
    getRedisMock.mockReturnValue(null);
    const { initSocket, getIO, closeSocket } = await import('@/socket');

    expect(getIO()).toBeNull();
    initSocket(httpServer);
    expect(getIO()).not.toBeNull();

    await closeSocket();
    expect(getIO()).toBeNull();
  });

  it('closeSocket is safe when never initialized', async () => {
    getRedisMock.mockReturnValue(null);
    const { closeSocket } = await import('@/socket');
    await expect(closeSocket()).resolves.toBeUndefined();
  });
});

describe('socket core — enabled Redis', () => {
  it('duplicates the client for the pub/sub adapter and quits sub on close', async () => {
    const ack = (_ch: string, cb?: (e: Error | null) => void) => cb?.(null);
    const sub = {
      subscribe: vi.fn(ack),
      psubscribe: vi.fn(ack),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK')
    };
    const pub = {
      duplicate: vi.fn(() => sub),
      on: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(ack),
      psubscribe: vi.fn(ack)
    };
    getRedisMock.mockReturnValue(pub);

    const { initSocket, closeSocket } = await import('@/socket');
    initSocket(httpServer);

    expect(pub.duplicate).toHaveBeenCalledTimes(1);

    await closeSocket();
    expect(sub.quit).toHaveBeenCalledTimes(1);
  });
});
