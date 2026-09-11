'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { QrCode } from '@/components/ui/QrCode';
import { Barcode } from '@/components/ui/Barcode';
import { Letterhead } from '@/components/report/Letterhead';
import { cn } from '@/lib/utils';
import type { ReportData, ReportTest } from '@/modules/reporting/report.types';

/**
 * The document a patient keeps and a referring doctor judges the lab by.
 *
 * Three things make it read as a clinical report rather than a printout:
 * the lab's own letterhead, a results table where the abnormal values are
 * findable in one pass, and a signature block — a report nobody signed is not
 * a report. Structure is carried by rules and weight, deliberately unlike the
 * on-screen card language: paper has no hover, and a ruled table is the
 * convention every doctor already reads.
 *
 * Printed "with history", each test also carries the patient's last few
 * released results for the same parameters, joined through their MR number,
 * so a change over time is on the page rather than in someone's memory.
 */

const FLAG_STYLE: Record<string, string> = {
  HIGH: 'text-red-700 font-bold',
  LOW: 'text-blue-700 font-bold',
  CRITICAL: 'text-red-700 font-extrabold',
  NORMAL: 'text-body',
};
const FLAG_MARK: Record<string, string> = { HIGH: 'H', LOW: 'L', CRITICAL: 'CRITICAL', NORMAL: '' };
const TREND_MARK: Record<string, string> = { UP: '▲', DOWN: '▼', SAME: '▬' };

export function ReportDocument({
  data, showActions = true, withHistory = false, letterhead = true,
}: {
  data: ReportData;
  showActions?: boolean;
  /** Add the patient's earlier results beside each value. */
  withHistory?: boolean;
  /** Off for pre-printed letterhead paper: the space is kept, the masthead is not drawn. */
  letterhead?: boolean;
}) {
  const { t } = useI18n();
  const lh = data.letterhead;

  const abnormal = data.tests.flatMap((x) => x.params).filter((p) => p.flag !== 'NORMAL' && p.value != null && String(p.value).trim() !== '');
  const hasCritical = abnormal.some((p) => p.flag === 'CRITICAL');
  const verifiers = [...new Set(data.tests.map((x) => x.approvedBy).filter(Boolean))] as string[];
  const historyShown = withHistory && data.hasHistory;

  const codes = (
    <div className="flex flex-col items-end gap-1">
      <QrCode value={`LabFlow|${lh.labName}|MR:${data.mrNo}|Slip:${data.slipNo}`} size={letterhead ? 64 : 56} />
      <Barcode value={data.slipNo} height={16} width={92} />
    </div>
  );

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

      <div className="print-area report-sheet card p-4 sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* A single-cell table so the letterhead can ride in <thead>: Chrome
            repeats a table header group at the top of every printed page, so
            page 3 of a long report is still identifiably this lab's. */}
        <table className="w-full border-collapse">
          <thead className="print-running-head">
            <tr>
              <td className="p-0">
                {letterhead ? (
                  <Letterhead data={lh} docLabel={t('report.title')} docNumber={data.slipNo} right={codes} />
                ) : (
                  // Pre-printed paper already carries the lab's name and logo at
                  // the top, so that band is left blank and only what changes
                  // per report is printed beneath it.
                  <div className="flex items-end justify-between gap-4 border-b border-dashed border-line pb-2 pt-10 print:border-0 print:pt-[34mm]">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-subtle">{t('report.title')}</div>
                      <div className="font-mono text-lg font-extrabold tabular-nums text-strong">{data.slipNo}</div>
                    </div>
                    {codes}
                  </div>
                )}
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
                  {hasCritical ? t('report.criticalPresent') : (abnormal.length === 1 ? t('report.abnormalOne') : t('report.abnormalMany').replace('{n}', String(abnormal.length)))}
                </p>
              </td></tr>
            )}

            {data.tests.map((test, ti) => (
              <tr key={ti}><td className="p-0 pt-5">
                <TestBlock test={test} withHistory={historyShown} />
              </td></tr>
            ))}

            <tr><td className="p-0">
              {(abnormal.length > 0 || historyShown) && (
                <p className="mt-3 text-[10px] text-subtle">
                  {abnormal.length > 0 && (
                    <>
                      <b>H</b> {t('report.legendHigh')} · <b>L</b> {t('report.legendLow')} ·{' '}
                      <b>CRITICAL</b> {t('report.legendCritical')}
                    </>
                  )}
                  {abnormal.length > 0 && historyShown && ' · '}
                  {historyShown && (
                    <>
                      <b>▲ ▼</b> {t('report.legendTrend')} · {t('report.historyNote').replace('{mr}', data.mrNo)}
                    </>
                  )}
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

function TestBlock({ test, withHistory }: { test: ReportTest; withHistory: boolean }) {
  const { t } = useI18n();
  const cols = withHistory ? test.history : [];
  // Fixed geometry, shared by every test on the report. With auto layout each
  // test sized its own columns, so the Result column of one test sat somewhere
  // else on the next and no heading lined up with the values beneath it.
  // History columns take their width out of the reference column.
  const refWidth = 26 - cols.length * 8 + (cols.length > 0 ? 2 : 0);
  const rows = test.params.filter((p) => p.value != null && String(p.value).trim() !== '');

  return (
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

      {test.culture && <CultureBlock culture={test.culture} />}

      {rows.length > 0 && (
      <table className="w-full table-fixed text-sm print:text-[11px]">
        <colgroup>
          <col style={{ width: cols.length > 0 ? '30%' : '38%' }} />
          <col style={{ width: cols.length > 0 ? '13%' : '15%' }} />
          <col style={{ width: cols.length > 0 ? '7%' : '9%' }} />
          <col style={{ width: cols.length > 0 ? '10%' : '12%' }} />
          <col style={{ width: `${cols.length > 0 ? refWidth : 26}%` }} />
          {cols.map((c) => <col key={c.visitId} style={{ width: '8%' }} />)}
        </colgroup>
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-subtle">
            <th className="py-1.5 text-start font-bold">{t('result.parameter')}</th>
            <th className="py-1.5 text-end font-bold">{t('result.result')}</th>
            <th className="py-1.5" aria-label="Flag" />
            <th className="py-1.5 ps-3 text-start font-bold">{t('result.unit')}</th>
            <th className="py-1.5 text-start font-bold">{t('result.reference')}</th>
            {cols.map((c) => (
              <th key={c.visitId} className="py-1.5 ps-1 text-end align-bottom font-bold normal-case tracking-normal">
                <span className="block whitespace-nowrap text-[10px]">{c.date}</span>
                <span className="block font-mono text-[9px] font-medium text-subtle">#{c.slipNo}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, pi) => {
            const flagged = p.flag !== 'NORMAL';
            return (
              <tr key={pi} className="border-b border-line/70 align-top">
                <td className={cn('break-words py-1.5 pe-2', p.isBold && 'font-bold')}>{p.name}</td>
                <td className={cn('py-1.5 text-end tabular-nums', FLAG_STYLE[p.flag] ?? 'text-body')}>
                  {withHistory && p.trend && p.trend !== 'SAME' && (
                    <span className="me-1 text-[9px] text-subtle" aria-label={t(`report.trend${p.trend}`)}>{TREND_MARK[p.trend]}</span>
                  )}
                  {p.value ?? '—'}
                  {p.interpretation && <span className="ms-1.5 text-[10px] font-extrabold uppercase print:text-[9px]">{p.interpretation}</span>}
                </td>
                {/* The flag sits in its own column so the eye can run down it,
                    instead of hunting inside the value. */}
                <td className="py-1.5 ps-1.5 text-center">
                  {flagged && !p.interpretation && (
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
                {cols.map((c, ci) => {
                  const v = p.previous[ci];
                  const f = p.previousFlags[ci];
                  return (
                    <td key={c.visitId} className={cn('py-1.5 ps-1 text-end text-xs tabular-nums print:text-[10px]',
                      f === 'HIGH' || f === 'CRITICAL' ? 'text-red-700' : f === 'LOW' ? 'text-blue-700' : 'text-muted')}>
                      {v ?? '—'}{f && f !== 'NORMAL' && v != null ? ` ${FLAG_MARK[f] === 'CRITICAL' ? '!' : FLAG_MARK[f]}` : ''}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      )}

      {(test.remarks || test.methodNote || test.performedAt) && (
        <div className="mt-2 space-y-0.5 text-xs text-body print:text-[10px]">
          {test.remarks && (
            <p className="whitespace-pre-wrap"><span className="font-bold">{t('report.remarks')}:</span> {test.remarks}</p>
          )}
          {test.performedAt && (
            <p className="text-muted"><span className="font-semibold">{t('report.performedAt')}:</span> {test.performedAt}</p>
          )}
          {test.methodNote && (
            <p className="whitespace-pre-wrap text-muted"><span className="font-semibold">{t('report.method')}:</span> {test.methodNote}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Culture & sensitivity, laid out the way a microbiology report reads: the
 * growth line first, then the antibiogram with one column each for Sensitive,
 * Intermediate and Resistant so a doctor can run down "what can I use".
 */
function CultureBlock({ culture }: { culture: NonNullable<ReportTest['culture']> }) {
  const { t } = useI18n();
  return (
    <div className="mt-2 space-y-2 text-sm print:text-[11px]">
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <p><span className="font-semibold text-muted">{t('culture.result')}:</span>{' '}
          <span className={culture.growth ? 'font-bold text-strong' : 'font-semibold text-body'}>
            {culture.growth ? culture.organism : t('culture.noGrowth')}
          </span>
        </p>
        {culture.growth && culture.colonyCount && (
          <p><span className="font-semibold text-muted">{t('culture.colonyCount')}:</span> {culture.colonyCount}</p>
        )}
        {culture.incubation && (
          <p className="sm:col-span-2"><span className="font-semibold text-muted">{t('culture.incubation')}:</span> {culture.incubation}</p>
        )}
      </div>
      {culture.growth && culture.sensitivities.length > 0 && (
        <table className="w-full table-fixed text-sm print:text-[11px]">
          <colgroup>
            <col style={{ width: '46%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wider text-subtle">
              <th className="py-1.5 text-start font-bold">{t('culture.antibiotic')}</th>
              <th className="py-1.5 text-center font-bold">{t('culture.S')}</th>
              <th className="py-1.5 text-center font-bold">{t('culture.I')}</th>
              <th className="py-1.5 text-center font-bold">{t('culture.R')}</th>
              <th className="py-1.5 text-end font-bold">MIC</th>
            </tr>
          </thead>
          <tbody>
            {culture.sensitivities.map((s, i) => (
              <tr key={i} className="border-b border-line/70">
                <td className="py-1 pe-2">{s.antibiotic}</td>
                {(['S', 'I', 'R'] as const).map((k) => (
                  <td key={k} className={cn('py-1 text-center font-extrabold', k === 'R' ? 'text-red-700' : k === 'S' ? 'text-emerald-700' : 'text-amber-700')}>
                    {s.result === k ? k : ''}
                  </td>
                ))}
                <td className="py-1 text-end text-xs tabular-nums text-muted">{s.mic ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {culture.remarks && <p className="whitespace-pre-wrap text-xs"><span className="font-bold">{t('report.remarks')}:</span> {culture.remarks}</p>}
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
