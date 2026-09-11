'use client';

import Link from 'next/link';
import { Compass, LayoutDashboard } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { buttonVariants } from '@/components/ui/Button';

/** A web address that leads nowhere — usually an old link or a typo. */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="card flex w-full max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
          <Compass className="h-7 w-7" />
        </span>
        <p className="font-mono text-xs font-bold tracking-widest text-subtle">404</p>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{t('notFound.title')}</h1>
        <p className="max-w-sm text-sm text-muted">{t('notFound.body')}</p>
        <Link href="/dashboard" className={buttonVariants({ className: 'mt-2' })}>
          <LayoutDashboard className="h-4 w-4" /> {t('common.backToDashboard')}
        </Link>
      </div>
    </main>
  );
}
