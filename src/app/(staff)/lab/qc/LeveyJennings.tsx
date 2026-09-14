'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import type { QcRunDTO } from '@/modules/qc/qc.actions';

/**
 * Levey-Jennings chart: each run plotted against the control's mean with
 * ±1, ±2 and ±3 SD lines. The y-axis is in SD units so every control reads the
 * same way; the labels on the right give the real values. Rejected runs are
 * drawn red, warnings amber.
 */
export function LeveyJennings({ runs, mean, sd, unit }: { runs: QcRunDTO[]; mean: number; sd: number; unit: string | null }) {
  const { t } = useI18n();
  const W = 720;
  const H = 280;
  const padL = 40;
  const padR = 76;
  const padT = 14;
  const padB = 28;
  const lim = 4;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const y = (z: number) => padT + plotH / 2 - (Math.max(-lim, Math.min(lim, z)) / lim) * (plotH / 2);
  const n = Math.max(runs.length, 2);
  const x = (i: number) => padL + (runs.length <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const points = runs.map((r, i) => ({ ...r, cx: x(i), cy: y((r.value - mean) / sd), z: (r.value - mean) / sd }));
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2));
  const lines = [3, 2, 1, 0, -1, -2, -3];
  const shortDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(iso));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[34rem]" role="img" aria-label={t('qc.chartLabel')}>
        <rect x={padL} y={y(2)} width={plotW} height={y(-2) - y(2)} fill="var(--color-ok-soft, #ecfdf5)" opacity={0.5} />
        {lines.map((z) => (
          <g key={z}>
            <line
              x1={padL} x2={padL + plotW} y1={y(z)} y2={y(z)}
              stroke={z === 0 ? 'currentColor' : Math.abs(z) === 3 ? '#dc2626' : Math.abs(z) === 2 ? '#d97706' : 'currentColor'}
              strokeOpacity={z === 0 ? 0.55 : Math.abs(z) === 1 ? 0.18 : 0.6}
              strokeDasharray={z === 0 ? undefined : '4 4'}
            />
            <text x={padL - 6} y={y(z) + 3} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity={0.6}>
              {z === 0 ? t('qc.mean') : `${z > 0 ? '+' : ''}${z}SD`}
            </text>
            <text x={padL + plotW + 6} y={y(z) + 3} fontSize="10" fill="currentColor" fillOpacity={0.6}>
              {fmt(mean + z * sd)}{z === 0 && unit ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <polyline points={points.map((p) => `${p.cx},${p.cy}`).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} />
        )}
        {points.map((p, i) => (
          <g key={p.id}>
            <circle
              cx={p.cx} cy={p.cy} r={4.5}
              fill={p.rejected ? '#dc2626' : p.violations ? '#d97706' : '#4f46e5'}
              stroke="white" strokeWidth={1.5}
            >
              <title>{`${shortDate(p.at)}: ${p.value}${unit ? ` ${unit}` : ''} (${p.z >= 0 ? '+' : ''}${p.z.toFixed(2)} SD)${p.violations ? ` — ${p.violations}` : ''}`}</title>
            </circle>
            {(i === 0 || i === points.length - 1 || (points.length <= 12)) && (
              <text x={p.cx} y={H - 8} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity={0.55}>{shortDate(p.at)}</text>
            )}
          </g>
        ))}
        {points.length === 0 && (
          <text x={padL + plotW / 2} y={padT + plotH / 2 - 12} textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity={0.6}>{t('qc.noRuns')}</text>
        )}
      </svg>
    </div>
  );
}
