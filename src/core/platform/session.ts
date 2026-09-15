import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parsePlatformAdmins } from './admins';
import { platformKey, readPlatformToken } from './token';

export const PLATFORM_COOKIE = 'lf_platform';

/**
 * The signed-in platform admin, or null. Checked against PLATFORM_ADMINS on
 * every request, so removing someone there ends their access at once rather
 * than when their cookie runs out.
 */
export async function currentPlatformAdmin(): Promise<string | null> {
  try {
    const admin = readPlatformToken(cookies().get(PLATFORM_COOKIE)?.value, platformKey());
    return admin && parsePlatformAdmins(process.env.PLATFORM_ADMINS).has(admin) ? admin : null;
  } catch {
    return null;
  }
}

export async function requirePlatformAdmin(): Promise<string> {
  const admin = await currentPlatformAdmin();
  if (!admin) redirect('/platform/login');
  return admin;
}
