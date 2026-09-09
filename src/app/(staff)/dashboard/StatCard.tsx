'use client';

import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';

export type StatTone = 'indigo' | 'cyan' | 'amber' | 'rose' | 'emerald';

const TONES: Record<StatTone, { chip: string; accent: string }> = {
  indigo: { chip: 'bg-brand-500/10 text-brand-600 dark:text-brand-300', accent: 'from-brand-400/0 to-brand-400/10' },
  cyan: { chip: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300', accent: 'from-cyan-400/0 to-cyan-400/10' },
  amber: { chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-300', accent: 'from-amber-400/0 to-amber-400/10' },
  rose: { chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-300', accent: 'from-rose-400/0 to-rose-400/10' },
  emerald: { chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', accent: 'from-emerald-400/0 to-emerald-400/10' },
};

export function StatCard({
  labelKey,
  value,
  icon: Icon,
  tone,
}: {
  labelKey: string;
  value: string;
  icon: LucideIcon;
  tone: StatTone;
}) {
  const { t } = useI18n();
  const tn = TONES[tone];
  return (
    <div className="card card-hover relative overflow-hidden p-5">
      <div className={cn('pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl', tn.accent)} />
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tn.chip)}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="mt-4 text-[26px] font-extrabold leading-none tracking-tight text-strong">{value}</div>
      <div className="mt-1.5 text-sm font-medium text-muted">{t(labelKey)}</div>
    </div>
  );
}
