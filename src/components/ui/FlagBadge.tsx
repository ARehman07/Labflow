'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { ArrowDown, ArrowUp, Check, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Badge } from './Badge';
import { FLAG_STATUS } from '@/lib/status';

const ICON: Record<string, LucideIcon> = { HIGH: ArrowUp, LOW: ArrowDown, CRITICAL: TriangleAlert, NORMAL: Check };

export function FlagBadge({ flag, size }: { flag: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const style = FLAG_STATUS[flag] ?? { tone: 'neutral' as const };
  const Icon = ICON[flag];
  return (
    <Badge tone={style.tone} size={size}>
      {Icon && <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
      {t(`flag.${flag}`)}
    </Badge>
  );
}
