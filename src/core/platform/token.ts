import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long a platform sign-in lasts. Short: this console can remove a lab. */
export const PLATFORM_SESSION_MS = 8 * 3600_000;

/**
 * The platform session: the admin's name and an expiry, signed with a key
 * derived from AUTH_SECRET. Kept apart from lab sessions on purpose — nothing a
 * lab user holds can be turned into platform access, or the other way round.
 */
export function platformKey(secret: string | undefined = process.env.AUTH_SECRET): Buffer {
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET is not set.');
  return createHmac('sha256', secret).update('labflow-platform-session').digest();
}

export function signPlatformToken(admin: string, key: Buffer, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ a: admin, e: now + PLATFORM_SESSION_MS })).toString('base64url');
  const sig = createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** The admin a token was signed for, or null if it is forged, altered or expired. */
export function readPlatformToken(token: string | undefined, key: Buffer, now = Date.now()): string | null {
  if (!token) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', key).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof a !== 'string' || typeof e !== 'number' || e <= now) return null;
    return a;
  } catch {
    return null;
  }
}
