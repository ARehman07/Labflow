'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileDown, HandHeart, History, ImageDown, MessageCircle, Printer, Stamp } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ReportDocument } from '@/components/report/ReportDocument';
import { cn } from '@/lib/utils';
import { whatsappLink } from '@/lib/whatsapp';
import { exportReport, reportFileName } from '@/lib/report-export';
import { markReportDeliveredAction, markReportPrintedAction } from '@/modules/lab/lab.actions';
import type { ReportData } from '@/modules/reporting/report.types';

const PREF_HISTORY = 'labflow.report.history';
const PREF_LETTERHEAD = 'labflow.report.letterhead';

/**
 * A released report, with the ways it leaves the lab.
 *
 * Printing it, sending it on WhatsApp and handing it over each record that it
 * happened. Two print choices sit beside Print because they depend on the
 * counter, not the report: whether this lab prints the patient's earlier
 * results alongside, and whether the paper in the tray already has the
 * letterhead on it. Both are remembered on this computer.
 */
export function StaffReport({
  visitId, data, canRelease, labName, portalLink, delivered, printed,
}: {
  visitId: string;
  data: ReportData;
  canRelease: boolean;
  labName: string;
  portalLink: string;
  delivered: boolean;
  printed: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [withHistory, setWithHistory] = useState(false);
  const [letterhead, setLetterhead] = useState(true);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setWithHistory(localStorage.getItem(PREF_HISTORY) === '1');
      setLetterhead(localStorage.getItem(PREF_LETTERHEAD) !== '0');
    } catch { /* storage blocked */ }
  }, []);
  const remember = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage blocked */ } };

  async function print() {
    if (canRelease && !printed) await markReportPrintedAction(visitId);
    window.print();
    router.refresh();
  }

  async function save(kind: 'pdf' | 'png') {
    const el = sheet.current?.querySelector<HTMLElement>('.report-sheet');
    if (!el) return;
    setBusy(kind);
    try {
      await exportReport(el, reportFileName(data.slipNo, data.mrNo), kind);
    } catch {
      toast('error', t('report.exportFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function deliver(channel: 'PRINT' | 'WHATSAPP') {
    if (channel === 'WHATSAPP') {
      const link = data.mobile ? whatsappLink(data.mobile, t('ready.waMessage')
        .replace('{name}', data.patientName)
        .replace('{lab}', labName)
        .replace('{slip}', data.slipNo)
        .replace('{link}', portalLink)) : null;
      if (!link) { toast('error', t('ready.noMobile')); return; }
      window.open(link, '_blank', 'noopener');
    }
    setBusy(channel);
    const res = await markReportDeliveredAction(visitId, channel);
    setBusy(null);
    if (res.ok) {
      toast('success', t('ready.done').replace('{name}', data.patientName));
      router.refresh();
    } else toast('error', res.error);
  }

  return (
    <div className="page">
      <div className="no-print space-y-3">
        <PageHeader
          title={t('report.title')}
          subtitle={`${data.patientName} · #${data.slipNo}`}
          back={{ href: '/lab', label: t('lab.title') }}
          actions={
            <>
              {delivered ? (
                <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> {t('report.delivered')}</Badge>
              ) : printed ? (
                <Badge tone="info">{t('report.printed')}</Badge>
              ) : null}
              <Button variant={delivered ? 'outline' : 'primary'} onClick={print}>
                <Printer className="h-4 w-4" /> {t('report.print')}
              </Button>
              {canRelease && !delivered && (
                <>
                  {data.mobile && (
                    <Button variant="outline" onClick={() => deliver('WHATSAPP')} loading={busy === 'WHATSAPP'}>
                      <MessageCircle className="h-4 w-4" /> {t('report.whatsapp')}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => deliver('PRINT')} loading={busy === 'PRINT'}>
                    <HandHeart className="h-4 w-4" /> {t('report.markHanded')}
                  </Button>
                </>
              )}
            </>
          }
        />

        {/* How this copy is laid out, and the files it can be saved as. */}
        <div className="flex flex-wrap items-center gap-2">
          <Toggle
            on={withHistory}
            disabled={!data.hasHistory}
            title={data.hasHistory ? undefined : t('report.noHistory')}
            onClick={() => { const v = !withHistory; setWithHistory(v); remember(PREF_HISTORY, v); }}
          >
            <History className="h-3.5 w-3.5" /> {t('report.withHistory')}
          </Toggle>
          <Toggle
            on={letterhead}
            onClick={() => { const v = !letterhead; setLetterhead(v); remember(PREF_LETTERHEAD, v); }}
          >
            <Stamp className="h-3.5 w-3.5" /> {t('report.letterhead')}
          </Toggle>
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
          <Button variant="ghost" size="sm" onClick={() => save('pdf')} loading={busy === 'pdf'}>
            <FileDown className="h-3.5 w-3.5" /> {t('report.downloadPdf')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => save('png')} loading={busy === 'png'}>
            <ImageDown className="h-3.5 w-3.5" /> {t('report.downloadPng')}
          </Button>
          {!data.hasHistory && <span className="text-xs text-subtle">{t('report.noHistory')}</span>}
        </div>
      </div>
      <div ref={sheet}>
        <ReportDocument data={data} showActions={false} withHistory={withHistory} letterhead={letterhead} />
      </div>
    </div>
  );
}

function Toggle({
  on, onClick, disabled, title, children,
}: { on: boolean; onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        on
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface text-muted hover:border-brand-300 hover:text-strong',
        disabled && 'cursor-not-allowed opacity-50 hover:border-line hover:text-muted',
      )}
    >
      {children}
    </button>
  );
}
