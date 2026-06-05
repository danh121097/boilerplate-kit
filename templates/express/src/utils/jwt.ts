import { config } from '@/config/environment';
import { JwtPayload } from '@/types/auth';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * token_use claim distinguishes access vs refresh tokens so a refresh token can
 * never satisfy access verification (defense in depth on top of the differing
 * algorithms). JwtPayload itself must NOT carry exp/iat/nbf — expiresIn owns exp.
 */
type TokenUse = 'access' | 'refresh';

/** Sign a short-lived access token (RS256, 15min default) */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(
    { ...payload, token_use: 'access' },
    config.jwtAccessPrivateKey,
    {
      algorithm: 'RS256',
      expiresIn: config.jwtAccessExpiry as string & jwt.SignOptions['expiresIn']
    }
  );
}

/** Verify access token with the public key; pin RS256 + require token_use=access */
export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtAccessPublicKey, {
    algorithms: ['RS256']
  }) as JwtPayload & { token_use?: TokenUse };
  if (decoded.token_use !== 'access') {
    throw new Error('Invalid token_use claim');
  }
  return decoded;
}

/**
 * Sign a long-lived refresh token (HS256, 7d default).
 * A random jti is embedded so two tokens for the same user signed within the
 * same second are never byte-identical — required for safe rotation, since the
 * token is hashed and looked up in the DB by that hash.
 */
export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(
    { ...payload, token_use: 'refresh' },
    config.jwtRefreshSecret,
    {
      algorithm: 'HS256',
      expiresIn: config.jwtRefreshExpiry as string &
        jwt.SignOptions['expiresIn'],
      jwtid: crypto.randomUUID()
    }
  );
}

/** Verify refresh token; pin HS256 + require token_use=refresh */
export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtRefreshSecret, {
    algorithms: ['HS256']
  }) as JwtPayload & { token_use?: TokenUse };
  if (decoded.token_use !== 'refresh') {
    throw new Error('Invalid token_use claim');
  }
  return decoded;
}

/** SHA-256 hash a token for secure DB storage */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
