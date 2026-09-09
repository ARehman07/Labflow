'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { cn, formatPkr } from '@/lib/utils';

/** Compact money for axis/bar labels: 44,613 → 44.6k. */
function shortPkr(n: number): string {
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}

/**
 * Vertical bar chart for 7-day revenue.
 *
 * The columns must stretch to the full plot height. Previously the row was
 * `items-end`, which sizes each column to its own content; the bar wrapper was
 * `flex-1` inside that content-sized column, so it collapsed to a few pixels
 * and every `height: N%` resolved against ~6px. Every bar came out the same
 * 6px stub — a Rs 44,613 day drew identically to a Rs 659 one, so the chart
 * showed a flat week that never happened. The plot area now has a fixed height
 * and the bars are positioned inside it.
 */
export function RevenueBars({ data }: { data: { label: string; value: number }[] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) return <p className="py-10 text-center text-sm text-subtle">{t('insights.noRevenue')}</p>;

  const best = data.reduce((a, b) => (b.value > a.value ? b : a));
  const avg = total / (data.length || 1);
  const avgPct = (avg / max) * 100;

  return (
    <div>
      <div className="flex gap-3">
        {/* A scale, so a bar can be read rather than hovered. */}
        <div className="flex h-44 w-10 shrink-0 flex-col justify-between pb-[22px] text-end text-[10px] tabular-nums text-subtle">
          <span>{shortPkr(max)}</span>
          <span>{shortPkr(max / 2)}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative flex h-44 items-stretch gap-2 pb-[22px]">
            {/* Average line — the reference that turns a bar into a judgement. */}
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-line"
              style={{ bottom: `calc(22px + ${avgPct}% - ${avgPct * 0.22}px)` }}
              aria-hidden
            />
            {data.map((d, i) => {
              const isBest = d.value === best.value && d.value > 0;
              const isToday = i === data.length - 1;
              const barPct = (d.value / max) * 100;
              return (
                <div key={i} className="flex min-w-0 flex-1 flex-col">
                  {/* Fixed-height plot area: the bar and its label are both
                      anchored to the baseline, so percentages resolve against a
                      real height instead of a collapsed flex item. */}
                  <div className="relative flex-1">
                    <div
                      className={cn(
                        'absolute inset-x-0 bottom-0 rounded-t-md transition-all duration-500',
                        isToday ? 'bg-brand-500' : 'bg-brand-500/45',
                      )}
                      // Linear height keeps the comparison honest; the pixel
                      // floor only stops a real but small day from reading as
                      // zero next to an outlier.
                      style={{ height: `${barPct}%`, minHeight: d.value > 0 ? 4 : 1 }}
                      title={`${d.label}: ${formatPkr(d.value)}`}
                    />
                    {d.value > 0 && (
                      <span
                        className={cn(
                          'pointer-events-none absolute inset-x-0 text-center text-[10px] font-bold tabular-nums',
                          isBest ? 'text-brand-600 dark:text-brand-300' : 'text-muted',
                        )}
                        style={{ bottom: `calc(${barPct}% + 7px)` }}
                      >
                        {shortPkr(d.value)}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'mt-1.5 h-4 truncate text-center text-[11px]',
                      isToday ? 'font-bold text-body' : 'font-medium text-subtle',
                    )}
                  >
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-muted">
          <b className="font-bold tabular-nums text-strong">{formatPkr(total)}</b> {t('insights.revenueTotal')}
        </span>
        <span className="text-muted">
          <b className="font-bold tabular-nums text-strong">{formatPkr(Math.round(avg))}</b> {t('insights.revenueAvg')}
        </span>
        <span className="text-muted">
          {t('insights.revenueBest')}: <b className="font-bold text-strong">{best.label}</b>{' '}
          <span className="tabular-nums">{formatPkr(best.value)}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Horizontal ranked bars (test mix / doctor leaderboard).
 *
 * One accent, not six. The old rainbow gave every row a different colour while
 * colour encoded nothing at all, so it read as six categories that do not exist.
 * Rank is already carried by order and bar length.
 */
export function RankList({ data, unit }: { data: { name: string; count: number }[]; unit: string }) {
  const { t } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0) return <p className="py-8 text-center text-sm text-subtle">{t('insights.noData')}</p>;

  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => {
        const share = total > 0 ? Math.round((d.count / total) * 100) : 0;
        return (
          <li key={i}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-body">
                <span className="me-1.5 text-[11px] font-bold tabular-nums text-subtle">{i + 1}</span>
                {d.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                <b className="font-semibold text-body">{d.count}</b> {unit}
                <span className="ms-1.5 text-subtle">{share}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  i === 0 ? 'bg-brand-500' : 'bg-brand-500/45',
                )}
                style={{ width: `${Math.max(4, (d.count / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Where the work actually is — one bar, not a row of charts.
 *
 * This was nine separate coloured columns, which read as nine unrelated charts
 * and spent a different hue on every stage while hue carried no meaning beyond
 * the label already underneath it. It is now a single stacked bar: one shape
 * whose whole width is the lab's workload, split in workflow order. Weight, not
 * colour, carries the pipeline — each stage is the one brand hue, stepped down
 * as work moves along it, and released work is neutral because it needs nobody.
 */
const PIPELINE_ORDER = [
  'BOOKED',
  'SAMPLE_COLLECTED',
  'SAMPLE_DISPATCHED',
  'SAMPLE_RECEIVED',
  'IN_PROGRESS',
  'RESULT_SAVED',
  'APPROVED',
  'PRINTED',
  'DELIVERED',
];
const RELEASED_FROM = 'APPROVED';

/** One hue, stepped down along the pipeline. Released work drops to neutral. */
const SHADE = ['bg-brand-600', 'bg-brand-500', 'bg-brand-400', 'bg-brand-300', 'bg-brand-200'];
const RELEASED_SHADE = 'bg-slate-300 dark:bg-slate-600';

export function PipelineBar({ data }: { data: { status: string; count: number }[] }) {
  const { t } = useI18n();
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="py-8 text-center text-sm text-subtle">{t('insights.noData')}</p>;

  const byStatus = new Map(data.map((d) => [d.status, d.count]));
  const stages = PIPELINE_ORDER.filter((st) => (byStatus.get(st) ?? 0) > 0).map((st) => ({
    status: st,
    count: byStatus.get(st) ?? 0,
    released: PIPELINE_ORDER.indexOf(st) >= PIPELINE_ORDER.indexOf(RELEASED_FROM),
  }));

  // The bottleneck is the biggest pile of UNFINISHED work — released stages are
  // not a problem to solve.
  const active = stages.filter((s2) => !s2.released);
  const bottleneck = active.length > 1
    ? active.reduce((a, b) => (b.count > a.count ? b : a)).status
    : null;
  const activeTotal = active.reduce((s2, x) => s2 + x.count, 0);
  const releasedTotal = total - activeTotal;

  let activeSeen = -1;

  return (
    <div>
      <div className="flex h-9 w-full gap-px overflow-hidden rounded-lg bg-line" role="img"
        aria-label={stages.map((st) => `${t(`status.${st.status}`)}: ${st.count}`).join(', ')}>
        {stages.map((st) => {
          if (!st.released) activeSeen += 1;
          const shade = st.released ? RELEASED_SHADE : SHADE[Math.min(activeSeen, SHADE.length - 1)];
          const pct = (st.count / total) * 100;
          return (
            <div
              key={st.status}
              className={cn('relative flex items-center justify-center transition-all duration-500', shade)}
              style={{ width: `${pct}%`, minWidth: 3 }}
              title={`${t(`status.${st.status}`)}: ${st.count}`}
            >
              {/* Only label a segment wide enough to hold the number. */}
              {pct >= 7 && (
                <span className={cn('text-xs font-bold tabular-nums', st.released ? 'text-body' : 'text-white')}>
                  {st.count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* The key doubles as the readout: stage, count, share. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {stages.map((st, i) => {
          const activeIdx = stages.slice(0, i + 1).filter((x) => !x.released).length - 1;
          const shade = st.released ? RELEASED_SHADE : SHADE[Math.min(activeIdx, SHADE.length - 1)];
          return (
            <li key={st.status} className="flex items-center gap-1.5 text-xs">
              <span className={cn('h-2 w-2 shrink-0 rounded-sm', shade)} aria-hidden />
              <span className={cn(st.status === bottleneck ? 'font-semibold text-warn-text' : 'text-muted')}>
                {t(`status.${st.status}`)}
              </span>
              <span className="font-bold tabular-nums text-strong">{st.count}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-muted">
          <b className="font-bold tabular-nums text-strong">{activeTotal}</b> {t('insights.inLab')}
        </span>
        <span className="text-muted">
          <b className="font-bold tabular-nums text-strong">{releasedTotal}</b> {t('insights.released')}
        </span>
        {bottleneck && (
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-md bg-warn-soft px-2 py-0.5 font-semibold text-warn-text">
            {t('insights.bottleneck')}: {t(`status.${bottleneck}`)}
          </span>
        )}
      </div>
    </div>
  );
}
