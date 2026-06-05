import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { signHmac } from '../helpers/hmac-sign';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const url = '/api/v1/health';
    const res = await request(app)
      .get(url)
      .set(signHmac('GET', url));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBeDefined();
    expect(res.body.uptime).toBeGreaterThan(0);
    // Redis is disabled under test env (REDIS_ENABLED unset).
    expect(res.body.redis).toBe('disabled');
  });
});
