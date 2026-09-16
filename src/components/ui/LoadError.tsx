'use client';

import { RotateCcw } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from './Button';

/**
 * A list that could not be loaded says so, and offers to try again.
 *
 * Worklists used to fall back to their empty state when a request failed, so
 * "the network dropped" and "nothing left to do" looked identical — on exactly
 * the screens where that difference is the whole point.
 */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text"
    >
      <span className="min-w-0 flex-1">{t('common.loadFailed')}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCcw className="h-3.5 w-3.5" /> {t('common.retry')}
      </Button>
    </div>
  );
}
