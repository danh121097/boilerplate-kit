import { SOCKET_UNAUTHORIZED } from './events';
import { JwtPayload } from '@/types/auth';
import { verifyAccessToken } from '@/utils/jwt';
import { getUserRevokedAt } from '@/utils/token-revocation';
import type { Socket } from 'socket.io';

/** Read a single cookie value from a raw Cookie header. */
function readCookie(
  header: string | undefined,
  name: string
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Access token from the handshake auth payload, falling back to the cookie. */
function extractToken(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token as string | undefined;
  if (fromAuth) {
    // Clients commonly send "Bearer <token>" — strip it like the HTTP middleware.
    return fromAuth.startsWith('Bearer ') ? fromAuth.slice(7) : fromAuth;
  }
  return readCookie(socket.handshake.headers.cookie, 'accessToken');
}

/**
 * Handshake auth: accept only a valid, non-revoked access token (header or cookie),
 * mirroring the HTTP auth middleware. Populates socket.data.user for handlers.
 * Revocation check is a no-op when Redis is disabled.
 */
export async function socketAuth(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error(SOCKET_UNAUTHORIZED));
    }

    const decoded = verifyAccessToken(token) as JwtPayload & { iat?: number };

    const revokedAt = await getUserRevokedAt(decoded.userId);
    if (revokedAt && decoded.iat && decoded.iat < revokedAt) {
      return next(new Error(SOCKET_UNAUTHORIZED));
    }

    socket.data.user = decoded;
    next();
  } catch {
    next(new Error(SOCKET_UNAUTHORIZED));
  }
}
