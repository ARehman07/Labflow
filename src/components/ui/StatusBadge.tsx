'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from './Badge';
import { ORDER_STATUS } from '@/lib/status';

/** Workflow status badge — colour + label, driven by the central status map. */
export function StatusBadge({ status, size }: { status: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const style = ORDER_STATUS[status] ?? { tone: 'neutral' as const };
  return (
    <Badge tone={style.tone} size={size} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}
