'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, Building2, ChevronRight, Plus, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn, formatPkr } from '@/lib/utils';
import { listPartnersAction, savePartnerAction, type PartnerRowDTO } from '@/modules/partners/partners.actions';

/**
 * B2B partner labs, both ways: labs that send samples here (inward) and
 * reference labs this lab sends tests to (outward). An inward lab on account
 * shows what it owes.
 */
export function PartnersClient({
  initial, rateGroups, canManage,
}: { initial: PartnerRowDTO[]; rateGroups: { id: string; name: string }[]; canManage: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [partners, setPartners] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', direction: 'INWARD' as 'INWARD' | 'OUTWARD', accountType: 'POSTPAID' as 'PREPAID' | 'CASH' | 'POSTPAID', rateGroupId: '', phone: '', contactPerson: '', email: '' });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<'INWARD' | 'OUTWARD'>('INWARD');

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await savePartnerAction(null, form);
      if (res.ok) { toast('success', t('partners.saved')); setAdding(false); setForm({ ...form, name: '', phone: '', contactPerson: '', email: '' }); setPartners(await listPartnersAction()); }
      else setError(res.error);
    });
  }

  const shown = partners.filter((p) => p.direction === tab);
  const owed = partners.filter((p) => p.direction === 'INWARD').reduce((s, p) => s + Math.max(0, p.balance), 0);

  return (
    <div className="page">
      <PageHeader
        title={t('partners.title')}
        subtitle={t('partners.subtitle')}
        actions={canManage && !adding ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('partners.add')}</Button> : undefined}
      />

      {adding && (
        <Card className="animate-fade-in-up space-y-3 p-5">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold text-strong">{t('partners.add')}</h2>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)} aria-label={t('common.cancel')}><X className="h-4 w-4" /></Button>
          </div>
          <Segmented
            value={form.direction}
            onChange={(v) => setForm({ ...form, direction: v })}
            options={[
              { value: 'INWARD', label: t('partners.inward'), icon: <ArrowDownToLine className="h-4 w-4" /> },
              { value: 'OUTWARD', label: t('partners.outward'), icon: <ArrowUpFromLine className="h-4 w-4" /> },
            ]}
          />
          <p className="text-xs text-subtle">{form.direction === 'INWARD' ? t('partners.inwardHint') : t('partners.outwardHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pl-name">{t('partners.name')}</label>
              <input id="pl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="pl-contact">{t('partners.contact')}</label>
              <input id="pl-contact" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="pl-phone">{t('partners.phone')}</label>
              <input id="pl-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="field" inputMode="tel" />
            </div>
            <div>
              <label className="label" htmlFor="pl-email">{t('partners.email')}</label>
              <input id="pl-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" type="email" />
            </div>
            {form.direction === 'INWARD' && (
              <>
                <div>
                  <span className="label">{t('partners.accountType')}</span>
                  <Select
                    value={form.accountType}
                    onChange={(v) => setForm({ ...form, accountType: v as typeof form.accountType })}
                    options={(['POSTPAID', 'PREPAID', 'CASH'] as const).map((k) => ({ value: k, label: t(`partners.account.${k}`) }))}
                  />
                </div>
                <div>
                  <span className="label">{t('cp.rateGroup')}</span>
                  <Select
                    value={form.rateGroupId}
                    onChange={(v) => setForm({ ...form, rateGroupId: v })}
                    options={[{ value: '', label: t('reception.standardPrices') }, ...rateGroups.map((g) => ({ value: g.id, label: g.name }))]}
                  />
                </div>
              </>
            )}
          </div>
          {error && <p className="note-danger"><Tr text={error} /></p>}
          <Button onClick={add} loading={isPending} disabled={form.name.trim().length < 2}>{t('partners.save')}</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'INWARD', label: `${t('partners.inward')} (${partners.filter((p) => p.direction === 'INWARD').length})` },
              { value: 'OUTWARD', label: `${t('partners.outward')} (${partners.filter((p) => p.direction === 'OUTWARD').length})` },
            ]}
          />
        </div>
        {tab === 'INWARD' && owed > 0 && (
          <span className="text-sm text-muted">{t('partners.totalOwed')} <b className="tabular-nums text-strong">{formatPkr(owed)}</b></span>
        )}
      </div>

      <Card className="p-2">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{t('partners.none')}</p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((p) => (
              <li key={p.id}>
                <Link href={`/partners/${p.id}`} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2', !p.isActive && 'opacity-60')}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"><Building2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-body">{p.name}</span>
                    <span className="text-xs text-subtle">
                      {p.direction === 'INWARD' ? t(`partners.account.${p.accountType}`) : t('partners.outward')}
                      {p.rateGroupName && ` · ${p.rateGroupName}`}
                      {` · ${t('partners.bookingsN').replace('{n}', String(p.bookings))}`}
                    </span>
                  </span>
                  {!p.isActive && <Badge tone="neutral" size="sm">{t('accounts.inactive')}</Badge>}
                  {p.direction === 'INWARD' && p.accountType !== 'CASH' && (
                    <span className={cn('text-sm font-bold tabular-nums', p.balance > 0 ? 'text-warn-text' : p.balance < 0 ? 'text-ok-text' : 'text-muted')}>
                      {p.balance < 0 ? `${t('partners.credit')} ${formatPkr(-p.balance)}` : formatPkr(p.balance)}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-subtle rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
