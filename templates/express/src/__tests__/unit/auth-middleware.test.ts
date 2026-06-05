import { authenticate } from '@/middleware/auth';
import { AppError } from '@/types';
import { signAccessToken } from '@/utils/jwt';
import { describe, it, expect, vi } from 'vitest';

describe('authenticate middleware', () => {
  const mockRes = {} as any;

  it('sets req.user on valid Bearer token', async () => {
    const mockNext = vi.fn();
    const token = signAccessToken({
      userId: '1',
      email: 'a@b.com',
      role: 'user',
    });
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    await authenticate(req, mockRes, mockNext);
    expect(req.user.userId).toBe('1');
    expect(mockNext).toHaveBeenCalled();
  });

  it('throws 401 without Authorization header', async () => {
    const mockNext = vi.fn();
    const req = { headers: {} } as any;
    await expect(authenticate(req, mockRes, mockNext)).rejects.toThrow(AppError);
  });

  it('throws 401 with invalid token', async () => {
    const mockNext = vi.fn();
    const req = {
      headers: { authorization: 'Bearer invalidtoken' },
    } as any;
    await expect(authenticate(req, mockRes, mockNext)).rejects.toThrow(AppError);
  });

  it('throws 401 without Bearer prefix', async () => {
    const mockNext = vi.fn();
    const req = { headers: { authorization: 'Basic abc' } } as any;
    await expect(authenticate(req, mockRes, mockNext)).rejects.toThrow(AppError);
  });
});
