'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus, Search, Tags } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SaveBar } from '@/components/ui/SaveBar';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn, formatPkr } from '@/lib/utils';
import {
  getRateGroupPricesAction,
  listRateGroupsAction,
  saveRateGroupAction,
  setRateGroupActiveAction,
  setRateGroupPricesAction,
  type RateGroupDTO,
  type RateGroupPricesDTO,
} from '@/modules/pricing/pricing.actions';

/**
 * Rate groups: price lists besides the standard one — for a B2B lab, a
 * collection point, or a panel of patients. A group sets its own price for any
 * test (the rest stay at standard) and a default discount that the counter can
 * apply in one step.
 */
export function RateGroupsClient({ initial }: { initial: RateGroupDTO[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [groups, setGroups] = useState(initial);
  const [name, setName] = useState('');
  const [pct, setPct] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState<RateGroupPricesDTO | null>(null);

  const reload = () => listRateGroupsAction(true).then(setGroups);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await saveRateGroupAction(null, { name, defaultDiscountPct: Number(pct) || 0 });
      if (res.ok) { setName(''); setPct(''); toast('success', t('rg.saved')); await reload(); }
      else setError(res.error);
    });
  }

  async function openPrices(id: string) {
    setBusy(id);
    const data = await getRateGroupPricesAction(id);
    setBusy(null);
    setOpen(data);
  }

  if (open) return <PriceEditor group={open} onClose={() => { setOpen(null); void reload(); }} />;

  return (
    <div className="page">
      <PageHeader title={t('rg.title')} subtitle={t('rg.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="rg-name">{t('rg.name')}</label>
            <input id="rg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('rg.namePlaceholder')} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="rg-pct">{t('rg.defaultDiscount')}</label>
            <div className="field flex items-center gap-2 py-0 pe-3.5 focus-within:border-brand-500 focus-within:bg-surface">
              <input id="rg-pct" type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0" className="field-inner py-2.5 tabular-nums" />
              <span className="text-sm font-bold text-subtle">%</span>
            </div>
          </div>
          <Button onClick={add} loading={isPending} disabled={name.trim().length < 2}><Plus className="h-4 w-4" /> {t('rg.new')}</Button>
        </div>
        {error && <p className="note-danger mt-3"><Tr text={error} /></p>}
      </Card>

      <Card className="p-2">
        {groups.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{t('rg.none')}</p>
        ) : (
          <ul className="space-y-0.5">
            {groups.map((g) => (
              <li key={g.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2', !g.isActive && 'opacity-60')}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"><Tags className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-body">{g.name}</span>
                  <span className="text-xs text-subtle">
                    {t('rg.pricesSet').replace('{n}', String(g.priceCount))}
                    {g.defaultDiscountPct > 0 && ` · ${t('rg.discountShort').replace('{pct}', String(g.defaultDiscountPct))}`}
                    {g.usedBy > 0 && ` · ${t('rg.usedBy').replace('{n}', String(g.usedBy))}`}
                  </span>
                </span>
                {!g.isActive && <Badge tone="neutral" size="sm">{t('accounts.inactive')}</Badge>}
                <Button variant="outline" size="sm" loading={busy === g.id} onClick={() => openPrices(g.id)}>{t('rg.prices')}</Button>
                <Button variant="ghost" size="sm" onClick={async () => { await setRateGroupActiveAction(g.id, !g.isActive); await reload(); }}>
                  {g.isActive ? t('accounts.hide') : t('accounts.show')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PriceEditor({ group, onClose }: { group: RateGroupPricesDTO; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const initial = useMemo(() => Object.fromEntries(group.tests.map((x) => [x.testId, x.price == null ? '' : String(x.price)])), [group]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [baseline, setBaseline] = useState(initial);
  const [q, setQ] = useState('');
  const [saving, startSave] = useTransition();
  const changed = Object.keys(values).filter((k) => values[k] !== baseline[k]);
  const shown = group.tests.filter((x) => !q.trim() || `${x.name} ${x.code} ${x.department}`.toLowerCase().includes(q.toLowerCase()));

  function save() {
    startSave(async () => {
      const res = await setRateGroupPricesAction(group.id, changed.map((testId) => ({
        testId, price: values[testId].trim() === '' ? null : Math.max(0, Number(values[testId]) || 0),
      })));
      if (res.ok) { setBaseline(values); toast('success', t('rg.pricesSaved')); }
      else toast('error', res.error);
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={group.name}
        subtitle={t('rg.pricesHint')}
        back={{ href: '/admin/rate-groups', label: t('rg.title') }}
        actions={<Button variant="outline" onClick={onClose}>{t('rg.back')}</Button>}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('rg.search')} className="field ps-10" aria-label={t('rg.search')} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-start text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-start">{t('rg.test')}</th>
              <th className="px-4 py-2.5 text-end">{t('rg.standard')}</th>
              <th className="w-44 px-4 py-2.5 text-end">{t('rg.groupPrice')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => {
              const v = values[x.testId] ?? '';
              const dirty = v !== baseline[x.testId];
              return (
                <tr key={x.testId} className={cn('border-b border-line/70', dirty && 'bg-brand-500/5')}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-body">{x.name}</div>
                    <div className="text-xs text-subtle">{x.code} · {x.department}</div>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums text-muted">{formatPkr(x.standard)}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      value={v}
                      placeholder={String(x.standard)}
                      aria-label={`${x.name} ${t('rg.groupPrice')}`}
                      onChange={(e) => setValues((s) => ({ ...s, [x.testId]: e.target.value }))}
                      className="field py-1.5 text-end tabular-nums"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <SaveBar
        dirty={changed.length > 0}
        saving={saving}
        onSave={save}
        onDiscard={() => setValues(baseline)}
        saveLabel={t('rg.savePrices')}
        note={t('rg.blankStandard')}
      />
    </div>
  );
}
