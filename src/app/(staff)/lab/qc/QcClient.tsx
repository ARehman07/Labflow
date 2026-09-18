'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Plus, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { DatePicker } from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';
import {
  createQcMaterialAction,
  listQcMaterialsAction,
  qcRunsAction,
  recordQcRunAction,
  setQcMaterialActiveAction,
  type QcMaterialDTO,
  type QcRunDTO,
} from '@/modules/qc/qc.actions';
import { LeveyJennings } from './LeveyJennings';

const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Internal QC. Pick a control, record today's value, and see it on the
 * Levey-Jennings chart judged by Westgard rules. A rejected run is red and
 * tells whoever approves results.
 */
export function QcClient({
  initial, parameters, canManage, canRecord, selectedId,
}: {
  initial: QcMaterialDTO[];
  parameters: { id: string; name: string; unit: string | null; test: string }[];
  canManage: boolean;
  canRecord: boolean;
  selectedId: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [materials, setMaterials] = useState(initial);
  const [selected, setSelected] = useState<string | null>(selectedId ?? initial.find((m) => m.isActive)?.id ?? null);
  const [runs, setRuns] = useState<QcRunDTO[]>([]);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ parameterId: '', name: '', level: '', lotNo: '', mean: '', sd: '', expiresAt: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const material = materials.find((m) => m.id === selected) ?? null;

  const loadRuns = useCallback(() => {
    if (!selected) { setRuns([]); return; }
    qcRunsAction(selected).then(setRuns).catch(() => setRuns([]));
  }, [selected]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const reload = () => listQcMaterialsAction(true).then(setMaterials);

  function record() {
    if (!selected) return;
    startSave(async () => {
      const res = await recordQcRunAction(selected, Number(value), note);
      if (!res.ok) { toast('error', res.error); return; }
      setValue(''); setNote('');
      if (res.rejected) toast('error', t('qc.rejectedToast').replace('{rules}', res.rejections.join(', ')));
      else if (res.warnings.length) toast('info', t('qc.warningToast').replace('{rules}', res.warnings.join(', ')));
      else toast('success', t('qc.inControl'));
      loadRuns();
      await reload();
    });
  }

  function addMaterial() {
    setError(null);
    startSave(async () => {
      const res = await createQcMaterialAction(form);
      if (!res.ok) { setError(res.error); return; }
      setAdding(false);
      setForm({ parameterId: '', name: '', level: '', lotNo: '', mean: '', sd: '', expiresAt: '' });
      await reload();
      setSelected(res.id);
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={t('qc.title')}
        subtitle={t('qc.subtitle')}
        back={{ href: '/lab', label: t('lab.title') }}
        actions={canManage && !adding ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('qc.addControl')}</Button> : undefined}
      />

      {adding && (
        <Card className="animate-fade-in-up space-y-3 p-5">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold text-strong">{t('qc.addControl')}</h2>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)} aria-label={t('common.cancel')}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <span className="label">{t('qc.parameter')}</span>
              <Select value={form.parameterId} onChange={(v) => setForm({ ...form, parameterId: v })} placeholder={t('portalLogins.choose')} options={parameters.map((p) => ({ value: p.id, label: `${p.test} · ${p.name}${p.unit ? ` (${p.unit})` : ''}` }))} />
            </div>
            <div>
              <label className="label" htmlFor="qc-name">{t('qc.material')}</label>
              <input id="qc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bio-Rad Lyphochek" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="qc-level">{t('qc.level')}</label>
              <input id="qc-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder={t('qc.levelPlaceholder')} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="qc-mean">{t('qc.targetMean')}</label>
              <input id="qc-mean" type="number" value={form.mean} onChange={(e) => setForm({ ...form, mean: e.target.value })} className="field tabular-nums" />
            </div>
            <div>
              <label className="label" htmlFor="qc-sd">{t('qc.sd')}</label>
              <input id="qc-sd" type="number" value={form.sd} onChange={(e) => setForm({ ...form, sd: e.target.value })} className="field tabular-nums" />
            </div>
            <div>
              <label className="label" htmlFor="qc-lot">{t('qc.lot')}</label>
              <input id="qc-lot" value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="qc-exp">{t('qc.expires')}</label>
              <DatePicker id="qc-exp" value={form.expiresAt} onChange={(v) => setForm({ ...form, expiresAt: v })} />
            </div>
          </div>
          {error && <p className="note-danger"><Tr text={error} /></p>}
          <Button onClick={addMaterial} loading={saving} disabled={!form.parameterId || !form.name.trim() || !form.level.trim() || !form.mean || !form.sd}>{t('qc.saveControl')}</Button>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="p-2">
          {materials.length === 0 ? (
            <p className="p-5 text-center text-sm text-muted">{canManage ? t('qc.noneManage') : t('qc.none')}</p>
          ) : (
            <ul className="space-y-0.5">
              {materials.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.id)}
                    aria-current={m.id === selected}
                    className={cn('flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-start transition-colors',
                      m.id === selected ? 'bg-brand-500/10' : 'hover:bg-surface-2', !m.isActive && 'opacity-50')}
                  >
                    {m.lastRun?.rejected ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" /> : <ShieldCheck className={cn('mt-0.5 h-4 w-4 shrink-0', m.lastRun ? 'text-ok-text' : 'text-subtle')} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-body">{m.parameter} · {m.level}</span>
                      <span className="block truncate text-xs text-subtle">{m.test} · {m.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {material && (
          <div className="space-y-4">
            <Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-strong">{material.parameter} — {material.level}</h2>
                  <p className="text-sm text-muted">
                    {material.test} · {material.name}{material.lotNo && ` · ${t('qc.lot')} ${material.lotNo}`}
                    {' · '}{t('qc.meanSd').replace('{mean}', String(material.mean)).replace('{sd}', String(material.sd))}{material.unit && ` ${material.unit}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {material.expiresAt && new Date(material.expiresAt) < new Date() && <Badge tone="danger" size="sm">{t('qc.expired')}</Badge>}
                  {canManage && (
                    <Button variant="ghost" size="sm" onClick={async () => { await setQcMaterialActiveAction(material.id, !material.isActive); await reload(); }}>
                      {material.isActive ? t('accounts.hide') : t('accounts.show')}
                    </Button>
                  )}
                </div>
              </div>
              <LeveyJennings runs={runs} mean={material.mean} sd={material.sd} unit={material.unit} />
              <p className="flex flex-wrap gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#4f46e5]" /> {t('qc.legendOk')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#d97706]" /> {t('qc.legendWarn')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" /> {t('qc.legendReject')}</span>
              </p>
            </Card>

            {canRecord && material.isActive && (
              <Card className="flex flex-wrap items-end gap-3 p-4">
                <div>
                  <label className="label" htmlFor="qc-value">{t('qc.todayValue')}</label>
                  <input id="qc-value" type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && value !== '') record(); }} className="field w-36 tabular-nums" />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="label" htmlFor="qc-note">{t('qc.note')}</label>
                  <input id="qc-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="field" />
                </div>
                <Button onClick={record} loading={saving} disabled={value === ''}>{t('qc.record')}</Button>
              </Card>
            )}

            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
                    <th className="px-4 py-2.5 text-start">{t('rep.time')}</th>
                    <th className="px-4 py-2.5 text-end">{t('qc.value')}</th>
                    <th className="px-4 py-2.5 text-end">SD</th>
                    <th className="px-4 py-2.5 text-start">{t('qc.rules')}</th>
                    <th className="px-4 py-2.5 text-start">{t('rep.by')}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">{t('qc.noRuns')}</td></tr>}
                  {[...runs].reverse().map((r) => (
                    <tr key={r.id} className={cn('border-b border-line/70', r.rejected && 'bg-danger-soft/50')}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtTime(r.at)}</td>
                      <td className="px-4 py-2 text-end font-semibold tabular-nums">{r.value}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-muted">{((r.value - material.mean) / material.sd).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        {r.violations ? <span className={cn('text-xs font-bold', r.rejected ? 'text-danger-text' : 'text-warn-text')}>{r.rejected ? t('qc.rejected') : t('qc.warning')}: {r.violations}</span> : <span className="text-xs text-ok-text">{t('qc.inControlShort')}</span>}
                        {r.note && <div className="text-xs text-subtle">{r.note}</div>}
                      </td>
                      <td className="px-4 py-2 text-muted">{r.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
