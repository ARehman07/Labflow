'use client';

import { useState, useTransition } from 'react';
import { MapPinned, Plus } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import {
  listCollectionPointsAction,
  saveCollectionPointAction,
  setCollectionPointActiveAction,
  type CollectionPointDTO,
} from '@/modules/pricing/pricing.actions';

/**
 * Collection points: places samples are taken away from the branch. Each
 * belongs to a branch and can carry its own price list, which a booking made
 * there uses automatically.
 */
export function CollectionPointsClient({
  initial, branches, rateGroups,
}: {
  initial: CollectionPointDTO[];
  branches: { id: string; name: string }[];
  rateGroups: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [points, setPoints] = useState(initial);
  const [form, setForm] = useState({ name: '', branchId: branches[0]?.id ?? '', rateGroupId: '', phone: '', address: '' });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () => listCollectionPointsAction(true).then(setPoints);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await saveCollectionPointAction(null, form);
      if (res.ok) { setForm({ ...form, name: '', phone: '', address: '' }); toast('success', t('cp.saved')); await reload(); }
      else setError(res.error);
    });
  }

  return (
    <div className="page">
      <PageHeader title={t('cp.title')} subtitle={t('cp.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />

      <Card className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cp-name">{t('cp.name')}</label>
            <input id="cp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" placeholder={t('cp.namePlaceholder')} />
          </div>
          <div>
            <span className="label">{t('cp.branch')}</span>
            <Select value={form.branchId} onChange={(v) => setForm({ ...form, branchId: v })} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </div>
          <div>
            <span className="label">{t('cp.rateGroup')}</span>
            <Select
              value={form.rateGroupId}
              onChange={(v) => setForm({ ...form, rateGroupId: v })}
              options={[{ value: '', label: t('reception.standardPrices') }, ...rateGroups.map((g) => ({ value: g.id, label: g.name }))]}
            />
          </div>
          <div>
            <label className="label" htmlFor="cp-phone">{t('cp.phone')}</label>
            <input id="cp-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="field" inputMode="tel" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="cp-address">{t('cp.address')}</label>
          <input id="cp-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="field" />
        </div>
        {error && <p className="note-danger"><Tr text={error} /></p>}
        <Button onClick={add} loading={isPending} disabled={form.name.trim().length < 2 || !form.branchId}><Plus className="h-4 w-4" /> {t('cp.new')}</Button>
      </Card>

      <Card className="p-2">
        {points.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{t('cp.none')}</p>
        ) : (
          <ul className="space-y-0.5">
            {points.map((p) => (
              <li key={p.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2', !p.isActive && 'opacity-60')}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"><MapPinned className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-body">{p.name}</span>
                  <span className="text-xs text-subtle">
                    {p.branchName} · {p.rateGroupName ?? t('reception.standardPrices')}{p.phone && ` · ${p.phone}`}
                  </span>
                </span>
                {!p.isActive && <Badge tone="neutral" size="sm">{t('accounts.inactive')}</Badge>}
                <Button variant="ghost" size="sm" onClick={async () => { await setCollectionPointActiveAction(p.id, !p.isActive); await reload(); }}>
                  {p.isActive ? t('accounts.hide') : t('accounts.show')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
