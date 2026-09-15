'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import type { AccessLevel } from '@/core/billing/access';

/** Said on every page while a lab's subscription is overdue, so nobody is surprised when it restricts. */
export function AccessBanner({ level, restrictsOn, isOwner }: { level: AccessLevel; restrictsOn: string | null; isOwner: boolean }) {
  const { t } = useI18n();
  if (level !== 'GRACE' && level !== 'READ_ONLY') return null;
  const date = restrictsOn ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date(restrictsOn)) : '';
  return (
    <div
      role="status"
      className={cn(
        'no-print mb-5 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
        level === 'GRACE' ? 'border-warn-line bg-warn-soft text-warn-text' : 'border-danger-line bg-danger-soft text-danger-text',
      )}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <b>{level === 'GRACE' ? t('access.graceTitle') : t('access.readOnlyTitle')}</b>{' '}
        {level === 'GRACE' ? t('access.graceBody').replace('{date}', date) : t('access.readOnlyBody')}
      </p>
      {isOwner && <Link href="/subscription" className="shrink-0 font-semibold underline underline-offset-2">{t('access.viewSubscription')}</Link>}
    </div>
  );
}
