'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { VisitsTable } from '@/components/portal/VisitsTable';
import { formatPkr } from '@/lib/utils';
import type { doctorHomeAction } from '@/modules/partners/portal.actions';

export function DoctorHome({ data }: { data: Awaited<ReturnType<typeof doctorHomeAction>> }) {
  const { t } = useI18n();
  const ready = data.visits.filter((v) => v.released).length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('portal.doctor.patients')}</h1>
        <p className="text-sm text-muted">{t('portal.doctor.welcome').replace('{lab}', data.labName)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('portal.doctor.referred')}</div><div className="mt-1 text-2xl font-extrabold tabular-nums text-strong">{data.visits.length}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('portal.doctor.reportsReady')}</div><div className="mt-1 text-2xl font-extrabold tabular-nums text-strong">{ready}</div></Card>
        {(data.commission.accrued > 0 || data.commission.paid > 0) && (
          <Card className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('portal.doctor.commission')}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-strong">{formatPkr(data.commission.accrued)}</div>
            <div className="text-xs text-subtle">{t('portal.doctor.commissionPaid').replace('{amount}', formatPkr(data.commission.paid))}</div>
          </Card>
        )}
      </div>
      <VisitsTable visits={data.visits} reportBase="/doctor/report" />
    </div>
  );
}
