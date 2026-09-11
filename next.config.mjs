/** @type {import('next').NextConfig} */

// Content-Security-Policy. Next's App Router injects inline hydration scripts, so
// script/style need 'unsafe-inline' without a nonce pipeline; everything else is
// locked down (no external scripts, framing, or unexpected connect targets).
//
// 'unsafe-eval' in DEVELOPMENT ONLY: Next's React Refresh runtime evaluates a
// string, and blocking it throws before hydration — which leaves the whole app
// rendered but dead, with no button working and no obvious cause. It is never
// emitted in a production build.
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  // Booking attachments (a phone photo of a prescription, a scanned letter) are
  // sent through a server action; the default 1 MB is smaller than most photos.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  // Security headers (closes items from ../vulnerabilities.md: H-1, H-3, clickjacking, CSP).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera for this site only: reception takes a patient photo at registration.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

export default nextConfig;
