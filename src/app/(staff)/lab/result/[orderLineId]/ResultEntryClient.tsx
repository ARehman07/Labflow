'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { FlagBadge } from '@/components/ui/FlagBadge';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { saveResultsAction, type EntryDTO } from '@/modules/lab/lab.actions';

export function ResultEntryClient({ entry }: { entry: EntryDTO }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  // measured values keyed by code
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of entry.params) {
      if (p.valueType !== 'CALCULATED') init[p.code] = p.existingValue ?? '';
    }
    return init;
  });

  // computed results after a save (code -> {value, flag})
  const [computed, setComputed] = useState<Record<string, { value: string | null; flag: string }>>(() => {
    const init: Record<string, { value: string | null; flag: string }> = {};
    for (const p of entry.params) {
      init[p.code] = { value: p.existingValue, flag: p.existingFlag ?? 'NORMAL' };
    }
    return init;
  });

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const editable = entry.canEdit;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveResultsAction({ orderLineId: entry.orderLineId, values });
      if (res.ok && res.computed) {
        const map: Record<string, { value: string | null; flag: string }> = {};
        for (const c of res.computed) map[c.code] = { value: c.value, flag: c.flag };
        setComputed(map);
        setSaved(true);
        toast('success', t('result.saved'));
      } else {
        setError(res.error ?? 'Save failed');
        toast('error', res.error ?? 'Save failed');
      }
    });
  }

  const inputCls =
    'w-full rounded-md border border-line-strong px-2 py-1.5 text-end focus:border-brand focus:outline-none disabled:bg-surface-2';

  const patientMeta = useMemo(
    () =>
      [
        entry.mrNo,
        entry.age != null ? `${entry.age} ${t('common.years')}` : null,
        entry.sex ? t(`reception.${entry.sex.toLowerCase()}`) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    [entry, t],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <Card className="flex items-center gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white">
          {entry.patientName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-strong">{entry.testName}</h1>
          <p className="truncate text-sm text-muted">{entry.patientName} · {patientMeta}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/lab')}>← {t('result.back')}</Button>
      </Card>

      {!editable && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">{t('result.notEditable')}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-3 py-2 text-start font-medium">{t('result.parameter')}</th>
              <th className="px-3 py-2 font-medium">{t('result.result')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('result.unit')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('result.reference')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('result.flag')}</th>
            </tr>
          </thead>
          <tbody>
            {entry.params.map((p) => {
              const isCalc = p.valueType === 'CALCULATED';
              const comp = computed[p.code];
              return (
                <tr key={p.id} className={cn('transition-colors hover:bg-surface-2', isCalc && 'bg-brand-500/[0.06]')}>
                  <td className={cn('px-3 py-2.5', p.isBold ? 'font-bold' : 'font-medium')}>
                    {p.name}
                    {isCalc && (
                      <span className="ms-2 inline-flex items-center gap-1 text-xs text-brand-500">
                        <Lock className="h-3 w-3" /> {t('result.calculated')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 w-32">
                    {isCalc ? (
                      <div className="text-end font-semibold text-body">{comp?.value ?? '—'}</div>
                    ) : p.valueType === 'OPTION' && p.options ? (
                      <Select
                        value={values[p.code] ?? ''}
                        disabled={!editable}
                        onChange={(val) => setValues((v) => ({ ...v, [p.code]: val }))}
                        placeholder="—"
                        options={p.options.split(',').map((o) => ({ value: o.trim(), label: o.trim() }))}
                      />
                    ) : (
                      <input
                        inputMode={p.valueType === 'NUMBER' ? 'decimal' : 'text'}
                        value={values[p.code] ?? ''}
                        disabled={!editable}
                        onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
                        className={inputCls}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{p.unit ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{p.referenceText || '—'}</td>
                  <td className="px-3 py-2">
                    {comp && comp.value != null ? <FlagBadge flag={comp.flag} /> : <span className="text-subtle">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
      {saved && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok-text">✓ {t('result.saved')}</p>}

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 p-3 backdrop-blur lg:ps-64">
          <div className="mx-auto flex max-w-3xl px-4">
            <Button size="lg" className="w-full" onClick={save} loading={isPending}>
              {t('result.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
