'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { Statement } from '@/app/(staff)/partners/[partnerId]/PartnerDetailClient';
import { cn, formatPkr } from '@/lib/utils';
import type { partnerStatementAction } from '@/modules/partners/portal.actions';

export function PartnerStatement({ data }: { data: Awaited<ReturnType<typeof partnerStatementAction>> }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('portal.b2b.statement')}</h1>
      <Card className="grid grid-cols-3 gap-3 p-5">
        <div><div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('partners.billed')}</div><div className="mt-1 text-xl font-extrabold tabular-nums">{formatPkr(data.totals.billed)}</div></div>
        <div><div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('partners.paidIn')}</div><div className="mt-1 text-xl font-extrabold tabular-nums">{formatPkr(data.totals.credit)}</div></div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{data.totals.balance < 0 ? t('partners.credit') : t('portal.b2b.youOwe')}</div>
          <div className={cn('mt-1 text-xl font-extrabold tabular-nums', data.totals.balance > 0 ? 'text-warn-text' : 'text-ok-text')}>{formatPkr(Math.abs(data.totals.balance))}</div>
        </div>
      </Card>
      <Statement rows={data.statement} />
    </div>
  );
}
