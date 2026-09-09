'use client';

import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { PrintButton } from '@/components/ui/PrintButton';
import { QrCode } from '@/components/ui/QrCode';
import { Letterhead } from '@/components/report/Letterhead';
import { formatPkr } from '@/lib/utils';
import type { Letterhead as LetterheadData } from '@/modules/reporting/report.types';

export interface SlipData {
  letterhead: LetterheadData;
  branchName: string;
  slipNo: string;
  bookedAt: string;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  mobile: string | null;
  doctorName: string | null;
  tests: { name: string }[];
  gross: number;
  discount: number;
  cardFee: number;
  net: number;
}

/**
 * The receipt a patient walks out with, and the thing they bring back to
 * collect their report. It carries the lab's letterhead for the same reason the
 * report does — and a QR of the slip number so the counter can find the visit
 * without retyping it.
 */
export function SlipView({ data }: { data: SlipData }) {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-xl font-bold text-strong">{t('slip.title')}</h1>
        <div className="flex gap-2">
          <Link href="/reception">
            <Button>+ {t('slip.newBooking')}</Button>
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="print-area print-page-slip card p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <table className="w-full border-collapse">
          <thead className="print-running-head">
            <tr>
              <td className="p-0">
                <Letterhead
                  data={data.letterhead}
                  docLabel={t('slip.title')}
                  docNumber={data.slipNo}
                  right={<QrCode value={`LabFlow|Slip:${data.slipNo}|MR:${data.mrNo}`} size={64} />}
                />
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-0 align-top">

        <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg bg-surface-2 px-4 py-3 text-sm print:rounded-none print:border print:border-line print:bg-transparent print:py-2 print:text-[11px]">
          <Field label={t('reception.patient')} value={data.patientName} strong />
          <Field label={t('reception.mrNo')} value={data.mrNo} />
          <Field
            label={`${t('reception.age')}/${t('reception.sex')}`}
            value={`${data.age ?? '—'}${data.sex ? ` / ${t(`reception.${data.sex.toLowerCase()}`)}` : ''}`}
          />
          <Field label={t('reception.mobile')} value={data.mobile ?? '—'} />
          <Field label={t('slip.date')} value={data.bookedAt} />
          {data.doctorName && <Field label={t('slip.doctor')} value={data.doctorName} />}
                </section>
              </td>
            </tr>

            <tr><td className="p-0">
                <table className="mt-5 w-full text-sm print:text-[11px]">
          <thead>
            <tr className="border-b-2 border-strong/80 text-[10px] uppercase tracking-wider text-subtle">
              <th className="w-8 py-1.5 text-start font-bold">#</th>
              <th className="py-1.5 text-start font-bold">{t('slip.tests')}</th>
            </tr>
          </thead>
          <tbody>
            {data.tests.map((tst, i) => (
              <tr key={i} className="border-b border-line/70">
                <td className="py-2 text-subtle tabular-nums">{i + 1}</td>
                <td className="py-2 font-medium">{tst.name}</td>
              </tr>
            ))}
                  </tbody>
                </table>
              </td>
            </tr>

            <tr><td className="p-0">
        {/* Totals sit right-aligned in a narrow column, the way a receipt reads. */}
        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1 text-sm print:text-[11px]">
            <Money label={t('slip.gross')} value={formatPkr(data.gross)} />
            <Money label={t('slip.discount')} value={`− ${formatPkr(data.discount)}`} />
            {data.cardFee > 0 && (
              <Money label={t('reception.cardFee')} value={`+ ${formatPkr(data.cardFee)}`} />
            )}
            <div className="flex justify-between border-t-2 border-strong/80 pt-1.5 text-base font-extrabold text-strong print:text-sm">
              <dt>{t('slip.net')}</dt>
              <dd className="tabular-nums">{formatPkr(data.net)}</dd>
            </div>
          </dl>
        </div>

              </td>
            </tr>
          </tbody>

          {/* Reserves the fixed footer's height at the foot of every page. */}
          <tfoot className="print-foot-spacer hidden print:table-footer-group">
            <tr><td className="p-0"><div className="h-[20mm]" /></td></tr>
          </tfoot>
        </table>

        <div className="print-running-foot mt-6 border-t border-line pt-2">
          <div className="flex items-baseline justify-between gap-6 text-[10px] text-subtle">
            <span className="font-semibold text-body">{data.letterhead.labName}</span>
            <span>{t('slip.title')} {data.slipNo} · {data.patientName} · {data.mrNo}</span>
          </div>
          <p className="mt-1 text-center text-[10px] text-subtle">{t('slip.keepSafe')}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-subtle">{label}:</span>
      <span className={strong ? 'min-w-0 break-words font-bold text-strong' : 'min-w-0 break-words text-body'}>
        {value}
      </span>
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
