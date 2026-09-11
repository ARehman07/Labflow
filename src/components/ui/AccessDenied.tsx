'use client';

import Link from 'next/link';
import { LayoutDashboard, Lock } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { buttonVariants } from './Button';

/**
 * Shown when someone opens a page their role does not include.
 *
 * It says what they tried to open, who can change that, and gives them a way
 * out. The bare amber sentence it replaces was a dead end: no explanation, no
 * next step, and English-only.
 */
export function AccessDenied({ area }: { area: string }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-warn-soft text-warn-text">
          <Lock className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{t('access.title')}</h1>
        <p className="max-w-sm text-sm text-muted">
          {t('access.body').replace('{area}', t(`access.area.${area}`))}
        </p>
        <Link href="/dashboard" className={buttonVariants({ className: 'mt-2' })}>
          <LayoutDashboard className="h-4 w-4" /> {t('common.backToDashboard')}
        </Link>
      </div>
    </div>
  );
}
