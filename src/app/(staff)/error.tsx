'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, RotateCcw, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button, buttonVariants } from '@/components/ui/Button';

/**
 * A staff screen that crashed. The menu and top bar stay in place around it,
 * so the rest of the app is still one click away, and "Try again" re-renders
 * just this screen rather than reloading everything.
 */
export default function StaffError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="page">
      <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-danger-text">
          <TriangleAlert className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{t('error.title')}</h1>
        <p className="max-w-sm text-sm text-muted">{t('error.body')}</p>
        {error.digest && (
          <p className="font-mono text-[11px] text-subtle">{t('error.ref')} {error.digest}</p>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}><RotateCcw className="h-4 w-4" /> {t('error.retry')}</Button>
          <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
            <LayoutDashboard className="h-4 w-4" /> {t('common.backToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
