'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button, buttonVariants } from '@/components/ui/Button';
import { BookingEditor } from './BookingEditor';
import { AttachmentsPanel } from './AttachmentsPanel';
import { PrintButton } from '@/components/ui/PrintButton';
import { QrCode } from '@/components/ui/QrCode';
import { Letterhead } from '@/components/report/Letterhead';
import { formatPkr } from '@/lib/utils';
import type { Letterhead as LetterheadData } from '@/modules/reporting/report.types';
import { Ban, FilePlus2, MessageSquareText, PencilLine } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

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
  tests: { name: string; remarks: string | null; packageName: string | null }[];
  collectionPoint: string | null;
  rateGroup: string | null;
  /** INSIDE_LAB, OUTSIDE_LAB, HOME or EXISTING. */
  sampleSource: string;
  /** When the patient was told to collect the report. */
  reportDue: string | null;
  canAttach: boolean;
  visitId: string;
  /** Comments from the counter. Shown on screen for staff, never printed. */
  notes: string | null;
  /** OPEN, COMPLETED or CANCELLED. */
  status: string;
  /** Tests still on the booking, with what each costs today, for editing. */
  lines: { id: string; testId: string; name: string; status: string; price: number }[];
  can: { modify: boolean; cancel: boolean };
  gross: number;
  discount: number;
  /** Who authorised the discount, when it was granted care of someone. */
  careOfName: string | null;
  /** What the discount was based on, so the line on paper says why. */
  discountSource: string;
  cardPct: number | null;
  /** The waiting-room token, matching the number on the TV. */
  tokenNumber: number | null;
  paid: number;
  paymentMethods: string[];
  /** What a patient types into the portal, alongside their mobile number. */
  labCode: string;
  portalUrl: string;
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
  const [editing, setEditing] = useState(false);
  const cancelled = data.status === 'CANCELLED';
  const editable = !cancelled && (data.can.modify || data.can.cancel);

  return (
    <div className="page">
      {/* Printing is what happens next at the counter, so it is the loud button;
          starting the next booking is one step after that. */}
      <div className="no-print">
        <PageHeader
          title={t('slip.title')}
          back={{ href: '/reception', label: t('nav.newBooking') }}
          actions={
            <>
              {editable && (
                <Button variant="outline" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
                  <PencilLine className="h-4 w-4" /> {t('edit.title')}
                </Button>
              )}
              <Link href="/reception" className={buttonVariants({ variant: 'outline' })}>
                <FilePlus2 className="h-4 w-4" /> {t('slip.newBooking')}
              </Link>
              <PrintButton variant="primary" />
            </>
          }
        />
      </div>

      {editing && <BookingEditor data={data} onClose={() => setEditing(false)} />}

      {cancelled && (
        <p className="no-print note-danger flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" /> {t('edit.cancelledBanner')}
        </p>
      )}

      {data.notes && (
        <div className="no-print flex items-start gap-2.5 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info-text">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">{t('reception.notes')}</div>
            <p className="whitespace-pre-wrap break-words">{data.notes}</p>
          </div>
        </div>
      )}

      <AttachmentsPanel visitId={data.visitId} canAttach={data.canAttach && !cancelled} canDelete={data.can.modify} />

      <div className="print-area print-page-slip card p-4 sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
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
          <Field label={t('slip.sampleSource')} value={t(`sample.${data.sampleSource}`)} />
          {data.collectionPoint && <Field label={t('slip.collectionPoint')} value={data.collectionPoint} />}
          {data.reportDue && <Field label={t('slip.reportDue')} value={data.reportDue} strong />}
                </section>

        {/* The token is what the patient watches for on the waiting-room TV,
            so it is the biggest thing on the slip after the lab's name. */}
        {data.tokenNumber != null && !cancelled && (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border-2 border-strong/80 px-4 py-2.5 print:py-1.5">
            <div>
              <div className="text-sm font-bold uppercase tracking-wider text-strong print:text-[11px]">{t('slip.token')}</div>
              <div className="text-xs text-muted print:text-[10px]">{t('slip.tokenHint')}</div>
            </div>
            <div className="font-mono text-5xl font-black leading-none tabular-nums text-strong print:text-4xl">{data.tokenNumber}</div>
          </div>
        )}
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
                <td className="py-2 font-medium">
                  {tst.name}
                  {tst.packageName && <span className="ms-2 rounded border border-line px-1 text-[10px] font-semibold uppercase text-subtle">{tst.packageName}</span>}
                  {tst.remarks && <span className="block text-xs font-normal text-muted print:text-[10px]">{tst.remarks}</span>}
                </td>
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
            {data.discount > 0 && (
              <Money
                label={
                  data.discountSource === 'FAMILY_CARD' && data.cardPct != null
                    ? t('slip.familyCard').replace('{pct}', String(data.cardPct))
                    : data.discountSource === 'DOCTOR'
                      ? t('slip.doctorDiscount')
                      : t('slip.discount')
                }
                value={`− ${formatPkr(data.discount)}`}
              />
            )}
            {data.careOfName && data.discount > 0 && (
              <Money label={t('slip.careOf')} value={data.careOfName} />
            )}
            {data.cardFee > 0 && (
              <Money label={t('reception.cardFee')} value={`+ ${formatPkr(data.cardFee)}`} />
            )}
            <div className="flex justify-between border-t-2 border-strong/80 pt-1.5 text-base font-extrabold text-strong print:text-sm">
              <dt>{t('slip.net')}</dt>
              <dd className="tabular-nums">{formatPkr(data.net)}</dd>
            </div>
            {data.paid > 0 && (
              <Money
                label={t('slip.paid').replace('{method}', data.paymentMethods.map((m) => t(`billing.method${m}`)).join(', '))}
                value={formatPkr(data.paid)}
              />
            )}
            {data.paid > data.net && (
              <div className="flex justify-between font-bold text-strong">
                <dt>{t('slip.refundDue')}</dt>
                <dd className="tabular-nums">{formatPkr(data.paid - data.net)}</dd>
              </div>
            )}
            {cancelled ? (
              <div className="pt-1 text-end">
                <span className="inline-block rounded border-2 border-red-600 px-2 py-0.5 text-sm font-black uppercase tracking-widest text-red-600">
                  {t('slip.cancelled')}
                </span>
              </div>
            ) : data.net - data.paid > 0 ? (
              <div className="flex justify-between font-bold text-strong">
                <dt>{t('slip.balance')}</dt>
                <dd className="tabular-nums">{formatPkr(data.net - data.paid)}</dd>
              </div>
            ) : data.net > 0 ? (
              <div className="pt-1 text-end">
                <span className="inline-block rounded border-2 border-strong/80 px-2 py-0.5 text-sm font-black uppercase tracking-widest text-strong">
                  {t('slip.paidInFull')}
                </span>
              </div>
            ) : null}
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

        {/* The portal asks for a lab code "printed on your booking slip" — so it is.
            The QR carries only the portal address and the lab code; the
            patient's number is never put into a link. */}
        <div className="mt-5 flex items-center gap-4 rounded-lg border border-dashed border-line-strong px-4 py-3 print:py-2">
          <QrCode value={`${data.portalUrl}?lab=${encodeURIComponent(data.labCode)}`} size={56} />
          <div className="min-w-0 text-sm print:text-[11px]">
            <div className="font-semibold text-strong">{t('slip.onlineTitle')}</div>
            <div className="text-muted">{t('slip.onlineBody').replace('{url}', data.portalUrl)}</div>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5">
              <span className="text-muted">{t('portal.labCode')}: <b className="font-mono tracking-wider text-strong">{data.labCode}</b></span>
              <span className="text-muted">{t('portal.mobile')}: <b className="font-mono text-strong">{data.mobile ?? '—'}</b></span>
            </div>
          </div>
        </div>

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
