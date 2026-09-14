'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn, formatPkr } from '@/lib/utils';
import { ROUND_STEPS } from '@/modules/pricing/adjust';
import { previewRateChangeAction, applyRateChangeAction } from '@/modules/pricing/rate-change.actions';
import type { RateChangeRow, rateChangeService } from '@/modules/pricing/rate-change.service';

type Options = Awaited<ReturnType<typeof rateChangeService.options>>;

/**
 * Change many prices at once — "everything in Haematology up 10%, rounded to
 * the nearest 10". Every price it would touch is listed with its new value
 * before anything is saved, because a wrong bulk change is charged to every
 * patient until someone notices.
 */
export function ChangeRatesClient({ options }: { options: Options }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    scope: 'BRANCH' as 'BRANCH' | 'RATE_GROUP',
    branchId: '',
    rateGroupId: options.rateGroups[0]?.id ?? '',
    departmentId: '',
    groupId: '',
    status: 'ACTIVE' as 'ACTIVE' | 'ALL',
    pct: '',
    roundTo: '10',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const [rows, setRows] = useState<RateChangeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [applying, startApply] = useTransition();

  const payload = useMemo(() => ({ ...form, pct: Number(form.pct) || 0, roundTo: Number(form.roundTo) }), [form]);
  const load = useCallback(() => {
    startLoad(async () => {
      const res = await previewRateChangeAction(payload);
      if (res.ok) { setRows(res.rows); setError(null); } else setError(res.error);
    });
  }, [payload]);
  const deb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(deb.current);
    deb.current = setTimeout(load, 350);
    return () => clearTimeout(deb.current);
  }, [load]);

  const changed = rows?.filter((r) => r.next !== r.current) ?? [];
  const showBranch = form.scope === 'BRANCH' && !form.branchId && options.branches.length > 1;

  function apply() {
    startApply(async () => {
      const res = await applyRateChangeAction(payload);
      if (res.ok) {
        toast('success', t('rates.applied').replace('{n}', String(res.count)));
        set({ pct: '' });
      } else {
        setError(res.error);
        toast('error', res.error);
      }
    });
  }

  return (
    <div className="page">
      <PageHeader title={t('rates.title')} subtitle={t('rates.subtitle')} back={{ href: '/admin/tests', label: t('admin.tests') }} />

      <Card className="space-y-4 p-5">
        <SectionHeading accent={ACCENT.brand}>{t('rates.which')}</SectionHeading>
        <div className="w-full sm:w-96">
          <Segmented
            value={form.scope}
            onChange={(v) => set({ scope: v })}
            options={[{ value: 'BRANCH', label: t('rates.scopeBranch') }, { value: 'RATE_GROUP', label: t('rates.scopeGroup') }]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {form.scope === 'BRANCH' ? (
            <div>
              <span className="label">{t('rates.branch')}</span>
              <Select
                value={form.branchId}
                onChange={(v) => set({ branchId: v })}
                options={[{ value: '', label: t('rates.allBranches') }, ...options.branches.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </div>
          ) : (
            <div>
              <span className="label">{t('rates.rateGroup')}</span>
              {options.rateGroups.length === 0 ? (
                <p className="py-2 text-sm text-subtle">{t('rates.noGroups')}</p>
              ) : (
                <Select value={form.rateGroupId} onChange={(v) => set({ rateGroupId: v })} options={options.rateGroups.map((g) => ({ value: g.id, label: g.name }))} />
              )}
            </div>
          )}
          <div>
            <span className="label">{t('rates.department')}</span>
            <Select
              value={form.departmentId}
              onChange={(v) => set({ departmentId: v })}
              options={[{ value: '', label: t('rates.anyDepartment') }, ...options.departments.map((d) => ({ value: d.id, label: d.name }))]}
            />
          </div>
          {options.groups.length > 0 && (
            <div>
              <span className="label">{t('rates.testGroup')}</span>
              <Select
                value={form.groupId}
                onChange={(v) => set({ groupId: v })}
                options={[{ value: '', label: t('rates.anyGroup') }, ...options.groups.map((g) => ({ value: g.id, label: g.name }))]}
              />
            </div>
          )}
          <div>
            <span className="label">{t('rates.status')}</span>
            <Select
              value={form.status}
              onChange={(v) => set({ status: v as 'ACTIVE' | 'ALL' })}
              options={[{ value: 'ACTIVE', label: t('rates.activeOnly') }, { value: 'ALL', label: t('rates.allTests') }]}
            />
          </div>
        </div>
        {form.scope === 'RATE_GROUP' && <p className="text-xs text-subtle">{t('rates.groupHint')}</p>}
      </Card>

      <Card className="space-y-3 p-5">
        <SectionHeading accent={ACCENT.amber}>{t('rates.change')}</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="rc-pct">{t('rates.percent')}</label>
            <div className="relative">
              <input
                id="rc-pct"
                type="number"
                step="0.5"
                min={-90}
                max={500}
                value={form.pct}
                onChange={(e) => set({ pct: e.target.value })}
                placeholder="10"
                className="field pe-8 tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3.5 text-sm font-semibold text-subtle">%</span>
            </div>
            <p className="mt-1 text-xs text-subtle">{t('rates.percentHint')}</p>
          </div>
          <div>
            <span className="label">{t('rates.roundTo')}</span>
            <Select
              value={form.roundTo}
              onChange={(v) => set({ roundTo: v })}
              options={ROUND_STEPS.map((n) => ({ value: String(n), label: t('rates.nearest').replace('{n}', String(n)) }))}
            />
          </div>
        </div>
      </Card>

      {error && <p className="note-danger"><Tr text={error} /></p>}

      <Card className={cn('overflow-hidden p-0 transition-opacity', loading && 'opacity-60')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm text-muted">
            {rows
              ? t('rates.summary').replace('{n}', String(changed.length)).replace('{u}', String(rows.length - changed.length))
              : t('common.loading')}
          </p>
          <ConfirmButton
            variant="primary"
            size="md"
            tone="primary"
            onConfirm={apply}
            loading={applying}
            disabled={changed.length === 0 || applying || loading}
            prompt={t('rates.applyPrompt').replace('{n}', String(changed.length))}
            confirmLabel={t('rates.applyYes')}
          >
            {t('rates.apply').replace('{n}', String(changed.length))}
          </ConfirmButton>
        </div>
        {rows && rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-subtle">{t('rates.empty')}</p>
        ) : rows && (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 z-[1] bg-surface">
                <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
                  <th className="px-4 py-2.5 text-start font-semibold">{t('rates.colTest')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{t('rates.department')}</th>
                  {showBranch && <th className="px-3 py-2.5 text-start font-semibold">{t('rates.branch')}</th>}
                  <th className="px-3 py-2.5 text-end font-semibold">{t('rates.colNow')}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{t('rates.colNew')}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t('rates.colDiff')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const diff = r.next - r.current;
                  return (
                    <tr key={r.key} className={cn('border-b border-line/60 last:border-0', diff === 0 && 'text-subtle')}>
                      <td className="px-4 py-2.5">
                        <div className={cn('font-medium', diff === 0 ? 'text-muted' : 'text-body')}>{r.name}</div>
                        <div className="font-mono text-[11px] text-subtle">{r.code}</div>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{r.department}</td>
                      {showBranch && <td className="px-3 py-2.5 text-muted">{r.branchName}</td>}
                      <td className="px-3 py-2.5 text-end tabular-nums">{formatPkr(r.current)}</td>
                      <td className={cn('px-3 py-2.5 text-end font-semibold tabular-nums', diff === 0 ? 'text-muted' : 'text-strong')}>{formatPkr(r.next)}</td>
                      <td className={cn('px-4 py-2.5 text-end tabular-nums', diff > 0 ? 'text-ok-text' : diff < 0 ? 'text-danger-text' : 'text-subtle')}>
                        {diff === 0 ? '—' : `${diff > 0 ? '+' : '−'} ${formatPkr(Math.abs(diff))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form.scope === 'BRANCH' && <p className="text-xs text-subtle">{t('rates.historyNote')}</p>}
    </div>
  );
}
