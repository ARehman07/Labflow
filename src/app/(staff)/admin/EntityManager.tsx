'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

export interface Field {
  name: string;
  labelKey: string;
  type?: 'text' | 'number' | 'password' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
}
export interface Column {
  key: string;
  labelKey: string;
}
type Row = Record<string, string>;

interface Props {
  titleKey: string;
  addLabelKey: string;
  columns: Column[];
  fields: Field[];
  createAction: (values: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
  reload: () => Promise<Row[]>;
}

export function EntityManager({ titleKey, addLabelKey, columns, fields, createAction, reload }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    reload().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => load(), [load]);

  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createAction(values);
      if (res.ok) { toast('success', t(addLabelKey)); setValues({}); setOpen(false); load(); }
      else { setError(res.error ?? 'Failed'); toast('error', res.error ?? 'Failed'); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-body">
            <Icon name="dashboard" className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t(titleKey)}</h1>
        </div>
        <Button onClick={() => setOpen((o) => !o)}>+ {t(addLabelKey)}</Button>
      </div>

      {open && (
        <Card className="animate-fade-in-up p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name}>
                <label className="label">{t(f.labelKey)}</label>
                {f.type === 'select' ? (
                  <Select value={values[f.name] ?? ''} onChange={(v) => set(f.name, v)} options={f.options ?? []} placeholder="—" />
                ) : (
                  <input
                    type={f.type ?? 'text'}
                    value={values[f.name] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                    className="field"
                  />
                )}
              </div>
            ))}
          </div>
          {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} loading={isPending}>{t(addLabelKey)}</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}>{t('common.cancel')}</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-[11px] font-bold uppercase tracking-wider text-subtle">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-2.5 text-start font-semibold">{t(c.labelKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-subtle">{t('common.loading')}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-subtle">—</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="transition-colors odd:bg-surface-2/40 hover:bg-surface-2">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2.5 text-body">{r[c.key] ?? '—'}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
