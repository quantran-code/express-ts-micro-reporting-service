import type { RequestHandler } from 'express';
import { HttpError } from '../errors/httpError';

export interface TokenClaims {
  role?: string;
}

/**
 * Reads the claims out of a JWT issued by the sister services' auth flow.
 * The signature is deliberately not verified: this service holds no signing
 * key material and only needs the caller's own role claim.
 */
export function decodeAccessToken(token: string): TokenClaims | null {
  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const claims = payload as Record<string, unknown>;
    return { role: typeof claims.role === 'string' ? claims.role : undefined };
  } catch {
    return null;
  }
}

export const requireLibrarian: RequestHandler = (req, res, next) => {
  const header = req.header('authorization');

  if (!header || !header.startsWith('Bearer ')) {
    next(new HttpError(401, 'Invalid access token'));
    return;
  }

  const claims = decodeAccessToken(header.slice('Bearer '.length).trim());
  if (!claims) {
    next(new HttpError(401, 'Invalid access token'));
    return;
  }

  if (claims.role !== 'librarian') {
    next(new HttpError(403, 'Librarian role required'));
    return;
  }

  next();
};
