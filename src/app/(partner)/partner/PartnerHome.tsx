'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { VisitsTable } from '@/components/portal/VisitsTable';
import { cn, formatPkr } from '@/lib/utils';
import type { partnerHomeAction } from '@/modules/partners/portal.actions';

export function PartnerHome({ data }: { data: Awaited<ReturnType<typeof partnerHomeAction>> }) {
  const { t } = useI18n();
  const onAccount = data.accountType !== 'CASH';
  const pending = data.visits.filter((v) => !v.allReleased).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('portal.b2b.bookings')}</h1>
          <p className="text-sm text-muted">{t('portal.b2b.welcome').replace('{lab}', data.labName)}</p>
        </div>
        <Link href="/partner/book" className={buttonVariants()}><Plus className="h-4 w-4" /> {t('portal.b2b.book')}</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('portal.b2b.inProgressN')}</div><div className="mt-1 text-2xl font-extrabold tabular-nums text-strong">{pending}</div></Card>
        {onAccount && (
          <>
            <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('partners.billed')}</div><div className="mt-1 text-2xl font-extrabold tabular-nums text-strong">{formatPkr(data.totals.billed)}</div></Card>
            <Card className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{data.totals.balance < 0 ? t('partners.credit') : t('portal.b2b.youOwe')}</div>
              <div className={cn('mt-1 text-2xl font-extrabold tabular-nums', data.totals.balance > 0 ? 'text-warn-text' : 'text-ok-text')}>{formatPkr(Math.abs(data.totals.balance))}</div>
            </Card>
          </>
        )}
      </div>
      <VisitsTable visits={data.visits} reportBase="/partner/report" />
    </div>
  );
}
