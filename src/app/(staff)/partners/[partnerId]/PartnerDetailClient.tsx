'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
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
import { recordPartnerTransactionAction, setPartnerActiveAction, type PartnerDetailDTO } from '@/modules/partners/partners.actions';
import type { PaymentAccountDTO } from '@/modules/accounts/accounts.actions';

const shortDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).format(new Date(iso));

/**
 * One partner lab: what it owes (or has in credit), its statement, its
 * bookings with their status, and — for a reference lab — what was sent to it.
 */
export function PartnerDetailClient({
  partner, accounts, canManage,
}: { partner: PartnerDetailDTO; accounts: PaymentAccountDTO[]; canManage: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState<'BOOKINGS' | 'STATEMENT'>('BOOKINGS');
  const [type, setType] = useState<'PAYMENT' | 'TOPUP' | 'REFUND'>(partner.accountType === 'PREPAID' ? 'TOPUP' : 'PAYMENT');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const onAccount = partner.direction === 'INWARD' && partner.accountType !== 'CASH';

  function record() {
    setError(null);
    startTransition(async () => {
      const res = await recordPartnerTransactionAction(partner.id, { type, amount: Number(amount), accountId, note });
      if (res.ok) { toast('success', t('partners.recorded')); setAmount(''); setNote(''); router.refresh(); }
      else setError(res.error);
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={partner.name}
        subtitle={[
          partner.direction === 'INWARD' ? t(`partners.account.${partner.accountType}`) : t('partners.outward'),
          partner.rateGroupName, partner.contactPerson, partner.phone,
        ].filter(Boolean).join(' · ')}
        back={{ href: '/partners', label: t('partners.title') }}
        actions={canManage ? (
          <Button variant="ghost" onClick={async () => { await setPartnerActiveAction(partner.id, !partner.isActive); router.refresh(); }}>
            {partner.isActive ? t('accounts.hide') : t('accounts.show')}
          </Button>
        ) : undefined}
      />

      {onAccount && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="grid grid-cols-3 gap-3 p-5">
            <Figure label={t('partners.billed')} value={formatPkr(partner.totals.billed)} />
            <Figure label={t('partners.paidIn')} value={formatPkr(partner.totals.credit)} />
            <Figure
              label={partner.totals.balance < 0 ? t('partners.credit') : t('partners.owes')}
              value={formatPkr(Math.abs(partner.totals.balance))}
              tone={partner.totals.balance > 0 ? 'warn' : partner.totals.balance < 0 ? 'ok' : undefined}
            />
          </Card>
          {canManage && (
            <Card className="space-y-2.5 p-4">
              <Segmented
                size="sm"
                value={type}
                onChange={setType}
                options={[
                  { value: 'PAYMENT', label: t('partners.tx.PAYMENT') },
                  { value: 'TOPUP', label: t('partners.tx.TOPUP') },
                  { value: 'REFUND', label: t('partners.tx.REFUND') },
                ]}
              />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('billing.amount')} aria-label={t('billing.amount')} className="field tabular-nums" />
                <Select value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t('partners.note')} aria-label={t('partners.note')} className="field" />
              {error && <p className="note-danger"><Tr text={error} /></p>}
              <Button className="w-full" onClick={record} loading={isPending} disabled={!(Number(amount) > 0)}>{t('partners.record')}</Button>
            </Card>
          )}
        </div>
      )}

      {partner.direction === 'INWARD' ? (
        <>
          <div className="w-full max-w-xs">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'BOOKINGS', label: t('partners.bookings') },
                { value: 'STATEMENT', label: t('partners.statement') },
              ]}
            />
          </div>
          {view === 'BOOKINGS' ? (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
                    <th className="px-4 py-2.5 text-start">{t('partners.date')}</th>
                    <th className="px-4 py-2.5 text-start">{t('partners.patient')}</th>
                    <th className="px-4 py-2.5 text-start">{t('partners.tests')}</th>
                    <th className="px-4 py-2.5 text-end">{t('partners.amount')}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {partner.visits.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">{t('partners.noBookings')}</td></tr>}
                  {partner.visits.map((v) => (
                    <tr key={v.id} className={cn('border-b border-line/70 align-top', v.status === 'CANCELLED' && 'opacity-50')}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="tabular-nums">{shortDate(v.bookedAt)}</div>
                        <div className="font-mono text-xs text-subtle">#{v.slipNo}{v.b2bNo && ` · ${v.b2bNo}`}</div>
                      </td>
                      <td className="px-4 py-2"><div className="font-medium text-body">{v.patient}</div><div className="text-xs text-subtle">{v.mrNo}</div></td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {v.tests.map((x, i) => <Badge key={i} tone={['APPROVED', 'PRINTED', 'DELIVERED'].includes(x.status) ? 'success' : 'neutral'} size="sm">{x.name}</Badge>)}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">
                        {formatPkr(v.net)}
                        {onAccount && v.paid < v.net && <div className="text-xs text-warn-text">{t('partners.dueN').replace('{amount}', formatPkr(v.net - v.paid))}</div>}
                      </td>
                      <td className="px-4 py-2 text-end">
                        {v.released && (
                          <Link href={`/lab/report/${v.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                            <FileText className="h-3.5 w-3.5" /> {t('lab.report')}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Statement rows={partner.statement} />
          )}
        </>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
                <th className="px-4 py-2.5 text-start">{t('partners.date')}</th>
                <th className="px-4 py-2.5 text-start">{t('partners.patient')}</th>
                <th className="px-4 py-2.5 text-start">{t('partners.test')}</th>
                <th className="px-4 py-2.5 text-start">{t('partners.status')}</th>
              </tr>
            </thead>
            <tbody>
              {partner.outsourced.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">{t('partners.noOutsourced')}</td></tr>}
              {partner.outsourced.map((o) => (
                <tr key={o.id} className="border-b border-line/70">
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">{o.sentAt ? shortDate(o.sentAt) : '—'}<div className="font-mono text-xs text-subtle">#{o.slipNo}{o.ref && ` · ${o.ref}`}</div></td>
                  <td className="px-4 py-2">{o.patient}</td>
                  <td className="px-4 py-2">{o.test}</td>
                  <td className="px-4 py-2 text-xs">{t(`status.${o.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</div>
      <div className={cn('mt-1 text-xl font-extrabold tabular-nums', tone === 'warn' ? 'text-warn-text' : tone === 'ok' ? 'text-ok-text' : 'text-strong')}>{value}</div>
    </div>
  );
}

export function Statement({ rows }: { rows: PartnerDetailDTO['statement'] }) {
  const { t } = useI18n();
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
            <th className="px-4 py-2.5 text-start">{t('partners.date')}</th>
            <th className="px-4 py-2.5 text-start">{t('partners.entry')}</th>
            <th className="px-4 py-2.5 text-end">{t('partners.charge')}</th>
            <th className="px-4 py-2.5 text-end">{t('partners.paidCol')}</th>
            <th className="px-4 py-2.5 text-end">{t('partners.balance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">{t('partners.noEntries')}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70">
              <td className="px-4 py-2 whitespace-nowrap tabular-nums">{shortDate(r.at)}</td>
              <td className="px-4 py-2">
                <div className="font-medium text-body">{r.kind === 'BOOKING' ? `${t('partners.tx.BOOKING')} #${r.ref}` : t(`partners.tx.${r.kind}`)}</div>
                <div className="text-xs text-subtle">{[r.kind === 'BOOKING' ? r.text : r.ref, r.kind !== 'BOOKING' ? r.text : null].filter(Boolean).join(' · ')}</div>
              </td>
              <td className="px-4 py-2 text-end tabular-nums">{r.amount > 0 ? formatPkr(r.amount) : ''}</td>
              <td className="px-4 py-2 text-end tabular-nums text-ok-text">{r.amount < 0 ? formatPkr(-r.amount) : ''}</td>
              <td className={cn('px-4 py-2 text-end font-semibold tabular-nums', r.balance > 0 ? 'text-warn-text' : 'text-body')}>{formatPkr(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
