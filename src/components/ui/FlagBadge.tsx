'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from './Badge';
import { FLAG_STATUS } from '@/lib/status';

const ICON: Record<string, string> = { HIGH: '↑', LOW: '↓', CRITICAL: '⚠', NORMAL: '✓' };

export function FlagBadge({ flag, size }: { flag: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const style = FLAG_STATUS[flag] ?? { tone: 'neutral' as const };
  return (
    <Badge tone={style.tone} size={size}>
      <span aria-hidden>{ICON[flag] ?? ''}</span> {t(`flag.${flag}`)}
    </Badge>
  );
}
