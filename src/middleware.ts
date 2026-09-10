import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/core/auth/auth.config';

// Edge-safe auth instance (no DB providers) — only reads the JWT session.
const { auth } = NextAuth(authConfig);

/**
 * Protects the staff area. Unauthenticated users hitting a protected route are
 * redirected to /login. The login page and public portal stay open.
 */
export default auth((req) => {
  // A session is only usable if it carries the tenant it belongs to. A cookie
  // that decrypts but predates the tenant fields (or was minted by another app
  // sharing this host — cookies ignore the port) would otherwise sail through
  // here and blow up deep in a page as MissingTenantError. Treat it as signed
  // out so the user lands on /login and gets a fresh, complete token.
  const isLoggedIn = !!req.auth?.user?.tenantId;
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/api/auth');

  if (!isLoggedIn && !isPublic) {
    const url = new URL('/login', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
