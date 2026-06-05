import { getRedis } from '@/config/redis';
import { Request, Response } from 'express';
import type { RouteGroup } from '@/types/routing';
import mongoose from 'mongoose';

/** Report Redis liveness: 'disabled' when off, else 'up'/'down' by PING. */
async function getRedisStatus(): Promise<string> {
  const client = getRedis();
  if (!client) return 'disabled';
  try {
    await client.ping();
    return 'up';
  } catch {
    return 'down';
  }
}

/** GET /health — server, database and Redis status */
async function healthCheck(_req: Request, res: Response): Promise<void> {
  const dbStateMap = new Map<number, string>([
    [0, 'disconnected'],
    [1, 'connected'],
    [2, 'connecting'],
    [3, 'disconnecting']
  ]);

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStateMap.get(mongoose.connection.readyState) ?? 'unknown',
    redis: await getRedisStatus()
  });
}

const healthGroup: RouteGroup = {
  prefix: '',
  routes: [
    {
      method: 'get',
      path: '/health',
      handler: healthCheck
    }
  ]
};

export default healthGroup;
