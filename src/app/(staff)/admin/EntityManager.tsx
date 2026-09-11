'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';

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

/**
 * A simple catalogue list with an add form: doctors, departments, branches.
 *
 * The way back to Admin used to be the dashboard's grid icon, and the list
 * showed "Loading…" in a table cell. It now uses the shared page header and
 * skeleton, and the table scrolls sideways on a phone instead of squeezing.
 */
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
      else { setError(res.error ?? t('error.title')); toast('error', res.error ?? t('error.title')); }
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={t(titleKey)}
        back={{ href: '/admin', label: t('admin.title') }}
        actions={!open ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t(addLabelKey)}
          </Button>
        ) : undefined}
      />

      {open && (
        <Card className="animate-fade-in-up p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f, i) => (
              <div key={f.name}>
                <label className="label" htmlFor={`ent-${f.name}`}>{t(f.labelKey)}</label>
                {f.type === 'select' ? (
                  <Select value={values[f.name] ?? ''} onChange={(v) => set(f.name, v)} options={f.options ?? []} placeholder="—" />
                ) : (
                  <input
                    id={`ent-${f.name}`}
                    type={f.type ?? 'text'}
                    value={values[f.name] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    autoFocus={i === 0}
                    className="field"
                  />
                )}
              </div>
            ))}
          </div>
          {error && <p className="note-danger mt-3"><Tr text={error} /></p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} loading={isPending}>{t(addLabelKey)}</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}>{t('common.cancel')}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle">
            <Inbox className="h-6 w-6" />
          </span>
          <p className="text-muted">{t('entity.empty')}</p>
          {!open && (
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t(addLabelKey)}</Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-subtle">
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-2.5 text-start font-semibold">{t(c.labelKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2">
                    {columns.map((c, ci) => (
                      <td key={c.key} className={ci === 0 ? 'px-4 py-3 font-medium text-strong' : 'px-4 py-3 text-body'}>
                        {r[c.key] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
