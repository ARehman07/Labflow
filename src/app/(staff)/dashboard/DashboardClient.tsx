'use client';

import Link from 'next/link';
import {
  Wallet, Users, AlarmClock, AlertTriangle, ShieldCheck, BellRing,
  Receipt, Timer, ArrowRight, ArrowUpRight, ArrowDownRight,
  Phone, CheckCircle2, ChevronRight, FilePlus2, FlaskConical, CreditCard,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { ACCENT, RailGroup } from '@/components/ui/List';
import { formatPkr, cn } from '@/lib/utils';
import type { DashboardData, CriticalPreview } from '@/modules/insights/insights.actions';

/**
 * Answers two questions — what needs me now, and how is today going — while
 * staying quiet enough to read.
 *
 * The previous pass got the information right and the composition wrong: ten
 * bordered boxes, four of them shouting a big number each, and "critical
 * results" written twice. Here the page is four containers, one focal point,
 * and red is spent in exactly one place.
 */

function waitedFor(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function DashboardClient({
  userName, data, permissions = [],
}: {
  userName: string;
  data: DashboardData | null;
  permissions?: string[];
}) {
  const { t } = useI18n();

  // Someone without insights.view gets no figures — revenue is not theirs to
  // see. An empty page is not the answer: give them the doors they can open.
  if (!data) {
    const has = (p: string) => permissions.includes(p);
    const shortcuts = [
      { show: has('visit.create'), href: '/reception', label: t('nav.newBooking'), icon: FilePlus2, hint: t('dashboard.scBooking') },
      { show: has('sample.collect') || has('result.enter') || has('workflow.advance'), href: '/lab', label: t('nav.lab'), icon: FlaskConical, hint: t('dashboard.scLab') },
      { show: has('patient.manage'), href: '/family-cards', label: t('nav.familyCards'), icon: CreditCard, hint: t('dashboard.scCards') },
      { show: has('billing.view'), href: '/billing', label: t('nav.billing'), icon: Receipt, hint: t('dashboard.scBilling') },
    ].filter((s) => s.show);

    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('dashboard.title')}</h1>
          <p className="text-muted">{t('dashboard.welcome')}, {userName}</p>
        </div>
        {shortcuts.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {shortcuts.map((s) => (
              <Link key={s.href} href={s.href} className="group card card-hover flex items-start gap-3 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition-colors group-hover:bg-brand-500/20 dark:text-brand-300">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-body">{s.label}</span>
                  <span className="block text-sm text-muted">{s.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Critical work has its own panel, so it is deliberately absent here — the
  // old layout named it twice, once as a tile and again as the panel heading.
  const pending = [
    { key: 'overdue', count: data.overdueTat, labelKey: 'alerts.overdue', href: '/lab', icon: AlarmClock, dot: 'bg-amber-500' },
    { key: 'approval', count: data.awaitingApproval, labelKey: 'alerts.approvals', href: '/lab/approvals', icon: ShieldCheck, dot: 'bg-brand-500' },
    { key: 'notifiable', count: data.notifiableOpen, labelKey: 'alerts.notifiable', href: '/lab/notifiable', icon: BellRing, dot: 'bg-amber-500' },
    { key: 'dues', count: data.duesCount, labelKey: 'dashboard.duesOpen', href: '/billing', icon: Receipt, dot: 'bg-slate-400', note: formatPkr(data.duesOutstanding) },
  ].filter((q) => q.count > 0);

  const nothingPending = pending.length === 0 && data.criticalOpen === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted">{t('dashboard.welcome')}, {userName}</p>
      </div>

      {/* ── Today: one card, four figures, separated by space ── */}
      <Card className="grid grid-cols-2 gap-1 p-1 sm:grid-cols-4">
        <Metric
          labelKey="dashboard.revenueToday"
          value={formatPkr(data.revenueToday)}
          icon={Wallet}
          delta={pctDelta(data.revenueToday, data.revenueYesterday)}
        />
        <Metric
          labelKey="dashboard.patientsToday"
          value={String(data.patientsToday)}
          icon={Users}
          delta={pctDelta(data.patientsToday, data.patientsYesterday)}
        />
        <Metric
          labelKey="dashboard.completedToday"
          value={String(data.testsCompletedToday)}
          icon={CheckCircle2}
        />
        <Metric
          labelKey="dashboard.onTime"
          value={data.onTimeRate === null ? '—' : `${data.onTimeRate}%`}
          icon={Timer}
          tone={data.onTimeRate !== null && data.onTimeRate < 80 ? 'bad' : undefined}
        />
      </Card>

      {nothingPending ? (
        <Card className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ok-soft text-ok-text">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <p className="font-medium text-body">{t('dashboard.allClear')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* The one thing on this page allowed to be loud. */}
          {data.criticalOpen > 0 && (
            <Card className="p-4 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-danger-text" />
                  <h2 className="text-sm font-semibold text-strong">{t('alerts.critical')}</h2>
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger-text tabular-nums">
                    {data.criticalOpen}
                  </span>
                </div>
                <Link
                  href="/lab/critical"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
                >
                  {t('dashboard.viewAll')} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <RailGroup accent={ACCENT.rose}>
                <ul className="space-y-0.5">
                  {data.criticalPreview.map((c) => (
                    <CriticalRow key={c.id} row={c} />
                  ))}
                </ul>
              </RailGroup>
            </Card>
          )}

          {/* Everything else: one quiet list, not four competing tiles. */}
          {pending.length > 0 && (
            <Card className={cn('p-4', data.criticalOpen === 0 && 'lg:col-span-3')}>
              <h2 className="mb-2 text-sm font-semibold text-strong">{t('dashboard.needsAttention')}</h2>
              <ul className="space-y-0.5">
                {pending.map((q) => (
                  <li key={q.key}>
                    <Link
                      href={q.href}
                      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', q.dot)} aria-hidden />
                      <span className="w-8 shrink-0 text-base font-bold text-strong tabular-nums">{q.count}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">{t(q.labelKey)}</span>
                      {q.note && (
                        <span className="shrink-0 text-xs font-semibold text-body tabular-nums">{q.note}</span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Workload pipeline={data.pipeline} />
    </div>
  );
}

/**
 * Where the work stands, in the four words the workboard already uses.
 *
 * This replaced a stage-by-stage bar chart with a "bottleneck" callout. That
 * chart was written for someone analysing throughput; the people reading this
 * screen want to know how many samples are still to take. Same numbers, said
 * plainly, and each one opens the workboard already filtered to it.
 */
const BUCKETS: { key: string; labelKey: string; statuses: string[]; dot: string }[] = [
  { key: 'COLLECT', labelKey: 'lab.filterCollect', statuses: ['BOOKED'], dot: 'bg-slate-400' },
  {
    key: 'PROGRESS',
    labelKey: 'lab.filterProgress',
    statuses: ['SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS'],
    dot: 'bg-amber-500',
  },
  { key: 'APPROVAL', labelKey: 'lab.filterApproval', statuses: ['RESULT_SAVED'], dot: 'bg-violet-500' },
  {
    key: 'READY',
    labelKey: 'lab.filterReady',
    statuses: ['APPROVED', 'PRINTED', 'DELIVERED'],
    dot: 'bg-emerald-500',
  },
];

function Workload({ pipeline }: { pipeline: { status: string; count: number }[] }) {
  const { t } = useI18n();
  const by = new Map(pipeline.map((p) => [p.status, p.count]));
  const buckets = BUCKETS.map((b) => ({
    ...b,
    count: b.statuses.reduce((n, st) => n + (by.get(st) ?? 0), 0),
  }));
  if (buckets.every((b) => b.count === 0)) return null;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-strong">{t('dashboard.workload')}</h2>
        <Link
          href="/lab"
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
        >
          {t('lab.title')} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {buckets.map((b) => (
          <Link
            key={b.key}
            href={`/lab?stage=${b.key}`}
            className="group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2"
          >
            <span className={cn('h-8 w-1 shrink-0 rounded-full', b.dot)} aria-hidden />
            <span className="min-w-0">
              <span className="block text-2xl font-extrabold leading-none text-strong tabular-nums">
                {b.count}
              </span>
              <span className="mt-1 block truncate text-xs text-muted">{t(b.labelKey)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function pctDelta(now: number, before: number): number | null {
  if (before === 0) return null; // no baseline — a percentage would be theatre
  const pct = Math.round(((now - before) / before) * 100);
  // Demo-scale swings produce 6592%, which reads as a glitch rather than growth.
  return Math.max(-999, Math.min(999, pct));
}

function CriticalRow({ row }: { row: CriticalPreview }) {
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-strong">{row.patientName}</span>
          <span className="shrink-0 font-mono text-[11px] text-subtle">{row.mrNo}</span>
        </div>
        <div className="truncate text-xs text-muted">
          {row.testName} · {row.parameterName}
          <span className="ms-1.5 font-bold text-danger-text">
            {row.value}{row.unit ? ` ${row.unit}` : ''}
          </span>
        </div>
      </div>
      <span className="shrink-0 text-xs text-subtle tabular-nums">
        {t('dashboard.waiting')} {waitedFor(row.openedAt)}
      </span>
      {row.mobile && (
        <a
          href={`tel:${row.mobile}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger-text transition-opacity hover:opacity-80"
        >
          <Phone className="h-3 w-3" /> {t('dashboard.call')}
        </a>
      )}
    </li>
  );
}

function Metric({
  labelKey, value, icon: Icon, delta, tone,
}: {
  labelKey: string; value: string; icon: LucideIcon;
  delta?: number | null; tone?: 'bad';
}) {
  const { t } = useI18n();
  const up = (delta ?? 0) >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-xl p-4 transition-colors hover:bg-surface-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5 text-subtle" />
        {t(labelKey)}
      </div>
      <div
        className={cn(
          'mt-1.5 text-[26px] font-extrabold leading-none tracking-tight tabular-nums',
          tone === 'bad' ? 'text-danger-text' : 'text-strong',
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 h-4">
        {delta !== undefined && delta !== null && (
          <span className={cn('flex items-center gap-0.5 text-xs font-semibold', up ? 'text-ok-text' : 'text-danger-text')}>
            <Arrow className="h-3 w-3" />
            {Math.abs(delta)}%
            <span className="ms-0.5 font-normal text-subtle">{t('dashboard.vsYesterday')}</span>
          </span>
        )}
      </div>
    </div>
  );
}

