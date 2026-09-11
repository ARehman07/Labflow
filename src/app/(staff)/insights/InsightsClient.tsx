'use client';

import {
  Wallet, Users, TestTubes, AlarmClock, ArrowUpRight, ArrowDownRight,
  Info, type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { SectionHeading } from '@/components/ui/List';
import { RevenueBars, RankList, PipelineBar } from '@/components/charts/Charts';
import { cn, formatPkr } from '@/lib/utils';
import type { DashboardData } from '@/modules/insights/insights.actions';

/**
 * Read top to bottom this answers: how was today, how has the week gone, where
 * is work stuck, and what does the lab actually run. Every figure that has a
 * comparison available shows it — a number with nothing to measure it against
 * is trivia, not an insight.
 */

export function InsightsClient({ data }: { data: DashboardData }) {
  const { t } = useI18n();

  const pctDelta = (now: number, before: number): number | null => {
    if (before === 0) return null; // no baseline — a percentage would be theatre
    const pct = Math.round(((now - before) / before) * 100);
    return Math.max(-999, Math.min(999, pct));
  };

  return (
    <div className="page">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('insights.title')}</h1>
        <p className="mt-0.5 text-sm text-muted">{t('insights.subtitle')}</p>
      </div>

      {/* ── Today ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeading>{t('insights.todayHeading')}</SectionHeading>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            icon={Wallet}
            label={t('dashboard.revenueToday')}
            value={formatPkr(data.revenueToday)}
            delta={pctDelta(data.revenueToday, data.revenueYesterday)}
          />
          <Metric
            icon={Users}
            label={t('dashboard.patientsToday')}
            value={String(data.patientsToday)}
            delta={pctDelta(data.patientsToday, data.patientsYesterday)}
          />
          <Metric
            icon={TestTubes}
            label={t('insights.waitingResults')}
            value={String(data.pendingResults)}
            hint={data.awaitingApproval > 0
              ? `${data.awaitingApproval} ${t('lab.filterApproval').toLowerCase()}`
              : undefined}
          />
          <Metric
            icon={AlarmClock}
            label={t('insights.pastPromised')}
            value={String(data.overdueTat)}
            tone={data.overdueTat > 0 ? 'bad' : undefined}
            hint={data.onTimeRate != null ? `${data.onTimeRate}% ${t('dashboard.onTime').toLowerCase()}` : undefined}
          />
        </div>
      </section>

      {/* ── Revenue ───────────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionHeading>{t('insights.revenue7d')}</SectionHeading>
        <div className="mt-2">
          <RevenueBars data={data.revenue7d} />
        </div>
      </Card>

      {/* ── Pipeline ──────────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionHeading meta={t('insights.whereWorkHint')}>{t('insights.whereWork')}</SectionHeading>
        <div className="mt-2">
          <PipelineBar data={data.pipeline} />
        </div>
      </Card>

      {/* ── What the lab runs, and who sends it ───────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeading meta={t('insights.testMixHint')}>{t('insights.testMix')}</SectionHeading>
          <div className="mt-2">
            <RankList data={data.testMix} unit={t('insights.tests')} />
          </div>
        </Card>
        <Card className="p-5">
          <SectionHeading meta={t('insights.doctorsHint')}>{t('insights.doctors')}</SectionHeading>
          <div className="mt-2">
            <RankList data={data.doctors} unit={t('insights.referrals')} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon, label, value, delta, hint, tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  tone?: 'bad';
}) {
  const { t } = useI18n();
  const up = (delta ?? 0) >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5 text-subtle" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'mt-1.5 text-[26px] font-extrabold leading-none tracking-tight tabular-nums',
          tone === 'bad' ? 'text-danger-text' : 'text-strong',
        )}
      >
        {value}
      </div>
      {/* A figure only means something next to what it is being compared with. */}
      {delta != null ? (
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          <Arrow className={cn('h-3.5 w-3.5', up ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300')} />
          <span className={cn('font-semibold tabular-nums', up ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300')}>
            {Math.abs(delta)}%
          </span>
          <span className="text-subtle">{t('dashboard.vsYesterday')}</span>
        </div>
      ) : hint ? (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-subtle">
          <Info className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{hint}</span>
        </div>
      ) : (
        <div className="mt-1.5 h-4" />
      )}
    </Card>
  );
}
