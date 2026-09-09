'use client';

import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { LanguageToggle } from './LanguageToggle';

/**
 * Shared branded shell for full-screen auth/entry pages (login, patient portal).
 * Nova look: deep-ink base, indigo/cyan aurora, dotted grid, centered card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  maxWidth = 'max-w-sm',
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const { t } = useI18n();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink p-4">
      {/* Aurora + grid backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_15%_-10%,rgba(99,102,241,0.35),transparent_60%),radial-gradient(50rem_35rem_at_100%_110%,rgba(6,182,212,0.25),transparent_55%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(60% 60% at 50% 40%, #000 30%, transparent 80%)',
        }}
      />

      <div className={`relative w-full ${maxWidth} animate-scale-in`}>
        <div className="rounded-3xl border border-line bg-surface/95 p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
                <FlaskConical className="h-6 w-6" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-strong">{title}</h1>
                <p className="text-xs text-muted">{subtitle}</p>
              </div>
            </div>
            <LanguageToggle tone="light" />
          </div>
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-white/40">{t('app.name')} — {t('app.tagline')}</p>
      </div>
    </main>
  );
}
