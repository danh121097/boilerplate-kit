import { describe, it, expect, vi } from 'vitest';
import {
  registerSchema,
  loginSchema,
  validate,
} from '@/modules/auth/validation';
import { AppError } from '@/types';

describe('Zod Schemas', () => {
  it('registerSchema accepts valid input', () => {
    const result = registerSchema.safeParse({
      email: 'A@B.COM',
      password: '12345678',
      name: ' Jo ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('a@b.com');
      expect(result.data.name).toBe('Jo');
    }
  });

  it('registerSchema rejects invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'bad',
      password: '12345678',
      name: 'Jo',
    });
    expect(result.success).toBe(false);
  });

  it('loginSchema rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('validate middleware', () => {
  const mockReq = (body: unknown) => ({ body }) as any;
  const mockRes = {} as any;

  it('calls next on valid body', () => {
    const mockNext = vi.fn();
    const mw = validate(loginSchema);
    mw(mockReq({ email: 'a@b.com', password: 'pass' }), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('throws AppError on invalid body', () => {
    const mockNext = vi.fn();
    const mw = validate(loginSchema);
    expect(() => mw(mockReq({ email: 'bad' }), mockRes, mockNext)).toThrow(
      AppError
    );
  });
});
