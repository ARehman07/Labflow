import './globals.css';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { I18nProvider, type Locale } from '@/core/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';
import { ThemeProvider, THEME_BOOT_SCRIPT } from '@/core/theme/ThemeProvider';

export const metadata: Metadata = {
  title: 'LabFlow',
  description: 'Self-hosted Lab Information System',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'LabFlow', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

// Two values so the browser chrome matches the app in each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e17' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLocale = cookies().get('labflow_locale')?.value;
  const locale: Locale = cookieLocale === 'ur' ? 'ur' : 'en';
  const dir = locale === 'ur' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint. Without this the page
            renders light and then jumps, which is worse than no dark mode. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Clean naskh Urdu UI font. For an offline lab, self-host this later. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider initialLocale={locale}>
            <ToastProvider>{children}</ToastProvider>
          </I18nProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
