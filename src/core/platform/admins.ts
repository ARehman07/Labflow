import bcrypt from 'bcryptjs';

/**
 * Platform admins live in the server environment, never in the database, so no
 * lab owner — however much of their own lab they control — can make one.
 *
 *   PLATFORM_ADMINS="alice:<value>,bob:<value>"
 *
 * Each value is printed by `node scripts/platform-admin.mjs <username> <password>`:
 * a bcrypt hash, base64-encoded so the $ signs in it survive .env files. A raw
 * bcrypt hash is accepted too.
 */
export function parsePlatformAdmins(raw: string | undefined): Map<string, string> {
  const admins = new Map<string, string>();
  for (const entry of (raw ?? '').split(',')) {
    const at = entry.indexOf(':');
    if (at <= 0) continue;
    const username = entry.slice(0, at).trim().toLowerCase();
    let hash = entry.slice(at + 1).trim();
    if (!hash.startsWith('$2')) {
      try { hash = Buffer.from(hash, 'base64').toString('utf8'); } catch { continue; }
    }
    if (/^[a-z0-9._-]{2,40}$/u.test(username) && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/u.test(hash)) admins.set(username, hash);
  }
  return admins;
}

export function platformConfigured(): boolean {
  return parsePlatformAdmins(process.env.PLATFORM_ADMINS).size > 0;
}

// Compared against when the username is unknown, so a wrong username takes as
// long as a wrong password and the response does not reveal which admins exist.
const DECOY = bcrypt.hashSync('decoy-password-never-valid', 10);

/** The admin's username if the password matches, otherwise null. */
export async function verifyPlatformAdmin(username: string, password: string, raw = process.env.PLATFORM_ADMINS): Promise<string | null> {
  const name = username.trim().toLowerCase();
  const hash = parsePlatformAdmins(raw).get(name);
  const ok = await bcrypt.compare(password, hash ?? DECOY);
  return hash && ok ? name : null;
}
