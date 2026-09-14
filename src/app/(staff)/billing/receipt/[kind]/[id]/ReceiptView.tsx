'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { buttonVariants } from '@/components/ui/Button';
import { PrintButton } from '@/components/ui/PrintButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Letterhead } from '@/components/report/Letterhead';
import { formatPkr } from '@/lib/utils';
import type { Letterhead as LetterheadData } from '@/modules/reporting/report.types';

export interface ReceiptData {
  kind: 'PAYMENT' | 'REFUND' | 'DUE';
  letterhead: LetterheadData;
  visitId: string;
  slipNo: string;
  patientName: string;
  mrNo: string;
  mobile: string | null;
  at: string;
  net: number;
  amount: number;
  paidBefore: number;
  paidAfter: number;
  account: string | null;
  method: string | null;
  note: string | null;
  by: string | null;
}

/**
 * The paper for one money movement on a slip: a payment receipt, a refund slip,
 * or a due slip when a payment was taken back. The patient keeps it; the
 * signature lines are for when money crosses the counter.
 */
export function ReceiptView({ data }: { data: ReceiptData }) {
  const { t } = useI18n();
  const title = t(`receipt.${data.kind}`);
  const balance = data.net - data.paidAfter;
  const thisLabel = data.kind === 'PAYMENT' ? t('receipt.received') : data.kind === 'REFUND' ? t('receipt.refunded') : t('receipt.markedDue');

  return (
    <div className="page">
      <div className="no-print">
        <PageHeader
          title={title}
          subtitle={`${t('billing.slip')} #${data.slipNo} · ${data.patientName}`}
          back={{ href: '/billing', label: t('nav.billing') }}
          actions={
            <>
              <Link href={`/reception/${data.visitId}`} className={buttonVariants({ variant: 'outline' })}>
                <FileText className="h-4 w-4" /> {t('receipt.openSlip')}
              </Link>
              <PrintButton variant="primary" />
            </>
          }
        />
      </div>

      <div className="print-area print-page-slip card p-4 sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <Letterhead data={data.letterhead} docLabel={title} docNumber={data.slipNo} />

        <section className="mt-4 grid gap-x-8 gap-y-2 rounded-lg bg-surface-2 px-4 py-3 text-sm sm:grid-cols-2 print:grid-cols-2 print:rounded-none print:border print:border-line print:bg-transparent print:py-2 print:text-[11px]">
          <Field label={t('reception.patient')} value={data.patientName} strong />
          <Field label={t('reception.mrNo')} value={data.mrNo} />
          <Field label={t('reception.mobile')} value={data.mobile ?? '—'} />
          <Field label={t('receipt.date')} value={data.at} />
          <Field label={t('receipt.account')} value={data.account ?? (data.method ? t(`billing.method${data.method}`) : '—')} />
          <Field label={t('receipt.by')} value={data.by ?? '—'} />
        </section>

        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-sm space-y-1 text-sm print:text-[11px]">
            <Money label={t('receipt.bill')} value={formatPkr(data.net)} />
            <Money label={t('receipt.paidBefore')} value={formatPkr(data.paidBefore)} />
            <div className="flex justify-between border-y-2 border-strong/80 py-1.5 text-base font-extrabold text-strong print:text-sm">
              <dt>{thisLabel}</dt>
              <dd className="tabular-nums">{data.kind === 'PAYMENT' ? '' : '− '}{formatPkr(data.amount)}</dd>
            </div>
            <Money label={t('receipt.paidTotal')} value={formatPkr(data.paidAfter)} />
            {balance > 0 ? (
              <div className="flex justify-between font-bold text-strong"><dt>{t('receipt.stillDue')}</dt><dd className="tabular-nums">{formatPkr(balance)}</dd></div>
            ) : balance < 0 ? (
              <div className="flex justify-between font-bold text-strong"><dt>{t('receipt.refundDue')}</dt><dd className="tabular-nums">{formatPkr(-balance)}</dd></div>
            ) : (
              <div className="pt-1 text-end">
                <span className="inline-block rounded border-2 border-strong/80 px-2 py-0.5 text-sm font-black uppercase tracking-widest text-strong">{t('receipt.settled')}</span>
              </div>
            )}
          </dl>
        </div>

        {data.note && (
          <p className="mt-4 text-sm print:text-[11px]">
            <span className="text-subtle">{t('receipt.remarks')}:</span> <span className="text-body">{data.note}</span>
          </p>
        )}

        <div className="mt-12 grid grid-cols-2 gap-10 text-xs text-subtle print:mt-10 print:text-[10px]">
          <div className="border-t border-line-strong pt-1">{t('receipt.staffSign')}</div>
          <div className="border-t border-line-strong pt-1 text-end">{t('receipt.patientSign')}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-subtle">{label}:</span>
      <span className={strong ? 'min-w-0 break-words font-bold text-strong' : 'min-w-0 break-words text-body'}>{value}</span>
    </div>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
