'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn, formatPkr } from '@/lib/utils';
import type { AccessLevel } from '@/core/billing/access';

interface Data {
  planName: string | null; monthlyFee: number; paidUntil: string | null; graceDays: number;
  maxUsers: number | null; activeStaff: number; level: AccessLevel; restrictsOn: string | null;
  payments: { id: string; paidAt: string; months: number; amount: number; period: string; method: string | null; reference: string | null }[];
}

const TONE: Record<AccessLevel, string> = {
  ACTIVE: 'bg-ok-soft text-ok-text', GRACE: 'bg-warn-soft text-warn-text', READ_ONLY: 'bg-danger-soft text-danger-text', SUSPENDED: 'bg-danger-soft text-danger-text',
};

export function SubscriptionClient({ data }: { data: Data }) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    [t('sub.plan'), data.planName ?? t('sub.noPlan')],
    [t('sub.monthly'), data.monthlyFee > 0 ? formatPkr(data.monthlyFee) : '—'],
    [t('sub.paidUntil'), data.paidUntil ?? t('sub.notBilled')],
    [t('sub.grace'), t('sub.graceDays').replace('{n}', String(data.graceDays))],
    [t('sub.users'), data.maxUsers != null
      ? t('sub.usersOf').replace('{n}', String(data.activeStaff)).replace('{max}', String(data.maxUsers))
      : t('sub.usersNoLimit').replace('{n}', String(data.activeStaff))],
  ];
  return (
    <div className="page">
      <PageHeader title={t('sub.title')} subtitle={t('sub.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="section-title">{t('sub.status')}</span>
          <span className={cn('rounded-full px-3 py-1 text-sm font-bold', TONE[data.level])}>{t(`sub.level.${data.level}`)}</span>
        </div>
        {data.restrictsOn && data.level === 'GRACE' && <p className="mt-2 text-sm text-warn-text">{t('sub.restrictsOn').replace('{date}', data.restrictsOn)}</p>}
        <dl className="mt-4 divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold text-body">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="overflow-x-auto p-0">
        <div className="section-title px-5 pt-4">{t('sub.payments')}</div>
        {data.payments.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-muted">{t('sub.noPayments')}</p>
        ) : (
          <table className="mt-2 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
                <th className="px-5 py-2 text-start">{t('sub.colDate')}</th>
                <th className="px-3 py-2 text-start">{t('sub.colPeriod')}</th>
                <th className="px-3 py-2 text-start">{t('sub.colMethod')}</th>
                <th className="px-5 py-2 text-end">{t('sub.colAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2.5 whitespace-nowrap">{p.paidAt}</td>
                  <td className="px-3 py-2.5 text-muted">{p.period}</td>
                  <td className="px-3 py-2.5 text-muted">{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-5 py-2.5 text-end font-semibold tabular-nums">{formatPkr(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
