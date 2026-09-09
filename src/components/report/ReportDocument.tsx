'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { QrCode } from '@/components/ui/QrCode';
import { Letterhead } from '@/components/report/Letterhead';
import { cn } from '@/lib/utils';
import type { ReportData } from '@/modules/reporting/report.types';

/**
 * The document a patient keeps and a referring doctor judges the lab by.
 *
 * Three things make it read as a clinical report rather than a printout:
 * the lab's own letterhead, a results table where the abnormal values are
 * findable in one pass, and a signature block — a report nobody signed is not
 * a report. Structure is carried by rules and weight, deliberately unlike the
 * on-screen card language: paper has no hover, and a ruled table is the
 * convention every doctor already reads.
 */

const FLAG_STYLE: Record<string, string> = {
  HIGH: 'text-red-700 font-bold',
  LOW: 'text-blue-700 font-bold',
  CRITICAL: 'text-red-700 font-extrabold',
  NORMAL: 'text-body',
};
const FLAG_MARK: Record<string, string> = { HIGH: 'H', LOW: 'L', CRITICAL: 'CRITICAL', NORMAL: '' };

export function ReportDocument({ data, showActions = true }: { data: ReportData; showActions?: boolean }) {
  const { t } = useI18n();
  const lh = data.letterhead;

  const abnormal = data.tests.flatMap((x) => x.params).filter((p) => p.flag !== 'NORMAL');
  const hasCritical = abnormal.some((p) => p.flag === 'CRITICAL');
  const verifiers = [...new Set(data.tests.map((x) => x.approvedBy).filter(Boolean))] as string[];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {showActions && (
        <div className="no-print flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('report.title')}</h1>
          <Button variant="outline" onClick={() => window.print()}>
            <Icon name="print" className="h-4 w-4" /> {t('report.print')}
          </Button>
        </div>
      )}

      <div className="print-area card p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* A single-cell table so the letterhead can ride in <thead>: Chrome
            repeats a table header group at the top of every printed page, so
            page 3 of a long report is still identifiably this lab's. */}
        <table className="w-full border-collapse">
          <thead className="print-running-head">
            <tr>
              <td className="p-0">
                <Letterhead
                  data={lh}
                  docLabel={t('report.title')}
                  docNumber={data.slipNo}
                  right={
                    <QrCode
                      value={`LabFlow|${lh.labName}|MR:${data.mrNo}|Slip:${data.slipNo}`}
                      size={68}
                    />
                  }
                />
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-0 align-top">

        {/* Patient block — boxed so it reads as the subject of the document. */}
        <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg bg-surface-2 px-4 py-3 text-sm md:grid-cols-3 print:rounded-none print:border print:border-line print:bg-transparent print:py-2 print:text-[11px]">
          <Field label={t('reception.patient')} value={data.patientName} strong />
          <Field label={t('reception.mrNo')} value={data.mrNo} mono />
          <Field
            label={t('report.age')}
            value={[
              data.age != null ? `${data.age} ${t('common.years')}` : null,
              data.sex ? t(`reception.${data.sex.toLowerCase()}`) : null,
            ].filter(Boolean).join(' / ') || '—'}
          />
          <Field label={t('reception.mobile')} value={data.mobile ?? '—'} />
          <Field label={t('report.booked')} value={data.bookedAt} />
          <Field label={t('report.reported')} value={data.reportedAt ?? '—'} />
          {data.doctorName && <Field label={t('slip.doctor')} value={data.doctorName} />}
                </section>
              </td>
            </tr>

            {/* A doctor scanning a report looks for what is out of range first. */}
            {abnormal.length > 0 && (
              <tr><td className="p-0">
                <p
            className={cn(
              'mt-3 rounded-lg px-3 py-2 text-xs font-semibold print:rounded-none print:border',
              hasCritical
                ? 'bg-danger-soft text-danger-text print:border-red-700'
                : 'bg-warn-soft text-warn-text print:border-amber-600',
            )}
          >
                  {hasCritical ? t('report.criticalPresent') : t('report.abnormalPresent').replace('{n}', String(abnormal.length))}
                </p>
              </td></tr>
            )}

            {data.tests.map((test, ti) => (
              <tr key={ti}><td className="p-0 pt-5">
                <div className="break-inside-avoid">
              <div className="flex items-baseline justify-between border-b-2 border-strong/80 pb-1">
                <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-strong print:text-[12px]">
                  {test.name}
                </h2>
                {test.department && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                    {test.department}
                  </span>
                )}
              </div>

              {/* Fixed geometry, shared by every test on the report.
                  With auto layout each test sized its own columns, so the
                  Result column of one test sat somewhere else on the next and
                  no heading lined up with the values beneath it. */}
              <table className="w-full table-fixed text-sm print:text-[11px]">
                <colgroup>
                  <col className="w-[38%]" />
                  <col className="w-[15%]" />
                  <col className="w-[9%]" />
                  <col className="w-[12%]" />
                  <col className="w-[26%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-subtle">
                    <th className="py-1.5 text-start font-bold">{t('result.parameter')}</th>
                    <th className="py-1.5 text-end font-bold">{t('result.result')}</th>
                    <th className="py-1.5" aria-label="Flag" />
                    <th className="py-1.5 ps-3 text-start font-bold">{t('result.unit')}</th>
                    <th className="py-1.5 text-start font-bold">{t('result.reference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {test.params.map((p, pi) => {
                    const flagged = p.flag !== 'NORMAL';
                    return (
                      <tr key={pi} className="border-b border-line/70 align-top">
                        <td className={cn('break-words py-1.5 pe-2', p.isBold && 'font-bold')}>{p.name}</td>
                        <td className={cn('py-1.5 text-end tabular-nums', FLAG_STYLE[p.flag] ?? 'text-body')}>
                          {p.value ?? '—'}
                        </td>
                        {/* The flag sits in its own column so the eye can run
                            down it, instead of hunting inside the value. */}
                        <td className="py-1.5 ps-1.5 text-center">
                          {flagged && (
                            <span
                              className={cn(
                                'inline-block rounded px-1 text-[9px] font-extrabold leading-4',
                                p.flag === 'CRITICAL'
                                  ? 'bg-red-700 text-white'
                                  : p.flag === 'HIGH'
                                    ? 'bg-red-100 text-red-800 print:border print:border-red-700'
                                    : 'bg-blue-100 text-blue-800 print:border print:border-blue-700',
                              )}
                            >
                              {FLAG_MARK[p.flag]}
                            </span>
                          )}
                        </td>
                        <td className="break-words py-1.5 ps-3 text-muted">{p.unit ?? '—'}</td>
                        <td className="break-words py-1.5 text-xs text-muted print:text-[10px]">{p.reference || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                  </table>
                </div>
              </td></tr>
            ))}

            <tr><td className="p-0">
              {abnormal.length > 0 && (
                <p className="mt-3 text-[10px] text-subtle">
                  <b>H</b> {t('report.legendHigh')} · <b>L</b> {t('report.legendLow')} ·{' '}
                  <b>CRITICAL</b> {t('report.legendCritical')}
                </p>
              )}
              <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-wider text-subtle">
                {t('report.endOfReport')}
              </p>
            </td></tr>
          </tbody>

          {/* Reserves the fixed footer's height at the foot of EVERY page.
              Without this the footer paints over the last rows and results
              disappear off the printout entirely. */}
          <tfoot className="print-foot-spacer hidden print:table-footer-group">
            <tr><td className="p-0"><div className="h-[26mm]" /></td></tr>
          </tfoot>
        </table>

        {/*
          Signature and identification, pinned to the foot of every printed page.

          Two reasons it repeats rather than sitting only after the last result:
          a page separated from its report must still name the report it belongs
          to, and an unsigned page 2 is not a signed report. On screen this is a
          normal block at the end of the document.
        */}
        <div className="print-running-foot mt-8 border-t border-line pt-2">
          <div className="flex items-end justify-between gap-8">
            <div className="text-[10px] leading-tight text-subtle">
              <p className="font-semibold text-body">{lh.labName}</p>
              <p>
                {t('report.title')} {data.slipNo} · {data.patientName} · {data.mrNo}
              </p>
            </div>
            {verifiers.length > 0 && (
              <div className="text-center">
                <div className="w-52 border-t border-strong pt-1">
                  <div className="text-[11px] font-bold text-strong">{verifiers.join(', ')}</div>
                  <div className="text-[9px] uppercase tracking-wider text-subtle">
                    {t('report.verifiedBy')}
                  </div>
                </div>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-center text-[9px] leading-relaxed text-subtle">
            {lh.footerNote || t('report.footer')}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, strong, mono,
}: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-subtle">{label}:</span>
      <span className={cn('min-w-0 break-words text-body', strong && 'font-bold text-strong', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}
