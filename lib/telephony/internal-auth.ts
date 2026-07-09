import crypto from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Allows server-to-server callers (curl, the standalone agent worker, etc.)
 * to authenticate with a shared secret instead of a Clerk session, via the
 * `x-internal-secret` header. Only enabled when INTERNAL_SECRET_KEY is set —
 * never falls open.
 */
export function isAuthorizedInternalRequest(request: NextRequest): boolean {
  const secret = process.env.INTERNAL_SECRET_KEY;
  const provided = request.headers.get('x-internal-secret');
  if (!secret || !provided) return false;

  const secretBuf = Buffer.from(secret);
  const providedBuf = Buffer.from(provided);
  if (secretBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(secretBuf, providedBuf);
}
