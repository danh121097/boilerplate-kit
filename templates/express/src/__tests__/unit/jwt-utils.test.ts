import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { describe, it, expect } from 'vitest';
import { config } from '@/config/environment';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '@/utils/jwt';

describe('JWT Utils', () => {
  const payload = { userId: '123', email: 'a@b.com', role: 'user' as const };

  it('signAccessToken returns a JWT string', () => {
    const token = signAccessToken(payload);
    expect(token.split('.')).toHaveLength(3);
  });

  it('signAccessToken uses the RS256 algorithm', () => {
    const token = signAccessToken(payload);
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString()
    );
    expect(header.alg).toBe('RS256');
  });

  it('verifyAccessToken decodes signed token', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('123');
    expect(decoded.email).toBe('a@b.com');
  });

  it('verifyAccessToken throws on invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.here')).toThrow();
  });

  describe('access token forgery is rejected (alg pinned to RS256)', () => {
    it('rejects an HS256 token signed with the public key as secret', () => {
      const forged = jwt.sign(
        { ...payload, token_use: 'access' },
        config.jwtAccessPublicKey,
        { algorithm: 'HS256' }
      );
      expect(() => verifyAccessToken(forged)).toThrow();
    });

    it('rejects an HS256 token signed with an arbitrary secret', () => {
      const forged = jwt.sign(
        { ...payload, token_use: 'access' },
        'attacker-chosen-secret',
        { algorithm: 'HS256' }
      );
      expect(() => verifyAccessToken(forged)).toThrow();
    });

    it('rejects an alg:none token', () => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' })
      ).toString('base64url');
      const body = Buffer.from(
        JSON.stringify({ ...payload, token_use: 'access' })
      ).toString('base64url');
      const noneToken = `${header}.${body}.`;
      expect(() => verifyAccessToken(noneToken)).toThrow();
    });

    it('rejects an RS256 token signed by an unrelated keypair', () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const forged = jwt.sign(
        { ...payload, token_use: 'access' },
        privateKey,
        { algorithm: 'RS256' }
      );
      expect(() => verifyAccessToken(forged)).toThrow();
    });

    it('rejects a refresh token used as an access token', () => {
      const refreshToken = signRefreshToken(payload);
      expect(() => verifyAccessToken(refreshToken)).toThrow();
    });

    it('rejects a correctly-signed RS256 token whose token_use is not access', () => {
      // valid signature + algorithm, but wrong token_use → token_use guard fires
      const token = jwt.sign(
        { ...payload, token_use: 'refresh' },
        config.jwtAccessPrivateKey,
        { algorithm: 'RS256' }
      );
      expect(() => verifyAccessToken(token)).toThrow(/token_use/i);
    });
  });

  it('verifyRefreshToken rejects a token whose token_use is not refresh', () => {
    // valid HS256 signature, but token_use=access → token_use guard fires
    const token = jwt.sign(
      { ...payload, token_use: 'access' },
      config.jwtRefreshSecret,
      { algorithm: 'HS256' }
    );
    expect(() => verifyRefreshToken(token)).toThrow(/token_use/i);
  });

  it('signRefreshToken returns a verifiable JWT string', () => {
    const token = signRefreshToken(payload);
    expect(token.split('.')).toHaveLength(3);
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe('123');
  });

  it('signRefreshToken produces a unique token on each call', () => {
    expect(signRefreshToken(payload)).not.toBe(signRefreshToken(payload));
  });

  it('hashToken returns deterministic SHA-256 hex', () => {
    const hash1 = hashToken('test');
    const hash2 = hashToken('test');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('hashToken produces different hash for different input', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
