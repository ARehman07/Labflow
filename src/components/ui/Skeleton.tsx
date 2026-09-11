'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';

/**
 * Placeholder rows in the shape of a list that is on its way.
 *
 * The standard loading state for lists. A line of "Loading…" text says only
 * that something is happening; rows in the right shape say what is arriving,
 * and the page does not jump when it lands.
 */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn('card p-2', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-3">
          <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton h-3.5 rounded" style={{ width: `${56 - i * 5}%` }} />
            <div className="skeleton h-2.5 rounded" style={{ width: `${38 - i * 4}%` }} />
          </div>
          <div className="skeleton h-7 w-20 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
