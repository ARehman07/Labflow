'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileDown, HandHeart, History, ImageDown, Mail, MessageCircle, MessageSquare, Printer, Sparkles, Stamp } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ReportDocument } from '@/components/report/ReportDocument';
import { cn } from '@/lib/utils';
import { whatsappLink } from '@/lib/whatsapp';
import { renderTemplate } from '@/modules/messages/templates';
import { exportReport, reportFileName, reportPdfBase64 } from '@/lib/report-export';
import { printElement } from '@/lib/print-isolated';
import { emailReportAction, integrationsStatusAction, smsReportAction } from '@/modules/delivery/delivery.actions';
import { aiInterpretReportAction } from '@/modules/ai/ai.actions';
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
  visitId, data, canRelease, labName, portalLink, delivered, printed, waTemplate,
}: {
  visitId: string;
  data: ReportData;
  canRelease: boolean;
  labName: string;
  portalLink: string;
  delivered: boolean;
  printed: boolean;
  /** The lab's own WhatsApp wording, when it has saved one. */
  waTemplate: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [withHistory, setWithHistory] = useState(false);
  const [letterhead, setLetterhead] = useState(true);
  // The sheet waits until this device's print choices are read, so it is drawn
  // once in its final shape instead of redrawn with/without history columns.
  const [ready, setReady] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const [services, setServices] = useState({ email: false, sms: false, ai: false });
  const [aiText, setAiText] = useState<string | null>(null);
  useEffect(() => { integrationsStatusAction().then(setServices).catch(() => {}); }, []);

  async function emailReport() {
    const el = sheet.current?.querySelector<HTMLElement>('.report-sheet');
    if (!el) return;
    setBusy('EMAIL');
    try {
      const pdf = await reportPdfBase64(el);
      const res = await emailReportAction(visitId, pdf, portalLink);
      if (res.ok) { toast('success', t('report.emailed')); router.refresh(); } else toast('error', res.error);
    } catch {
      toast('error', t('report.exportFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function smsReport() {
    setBusy('SMS');
    const res = await smsReportAction(visitId, portalLink);
    setBusy(null);
    if (res.ok) { toast('success', t('report.smsSent')); router.refresh(); } else toast('error', res.error);
  }

  async function aiDraft() {
    setBusy('AI');
    const res = await aiInterpretReportAction(visitId);
    setBusy(null);
    if (res.ok) setAiText(res.text); else toast('error', res.error);
  }

  useEffect(() => {
    try {
      // A choice this person made on this device wins; otherwise the lab's default.
      const pref = localStorage.getItem(PREF_HISTORY);
      setWithHistory(pref === null ? data.historyByDefault : pref === '1');
      const lhPref = localStorage.getItem(PREF_LETTERHEAD);
      setLetterhead(lhPref === null ? data.layout.showHeader : lhPref !== '0');
    } catch { setWithHistory(data.historyByDefault); setLetterhead(data.layout.showHeader); }
    setReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remember = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage blocked */ } };

  async function print() {
    if (canRelease && !printed) await markReportPrintedAction(visitId);
    await printElement(sheet.current?.querySelector('.report-sheet'));
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
      const text = waTemplate
        ? renderTemplate(waTemplate, { patient: data.patientName, lab: labName, slip: data.slipNo, mr: data.mrNo, link: portalLink })
        : t('ready.waMessage').replace('{name}', data.patientName).replace('{lab}', labName).replace('{slip}', data.slipNo).replace('{link}', portalLink);
      const link = data.mobile ? whatsappLink(data.mobile, text) : null;
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
          {canRelease && (
            <>
              <Button variant="ghost" size="sm" onClick={emailReport} loading={busy === 'EMAIL'} disabled={!services.email} title={services.email ? undefined : t('report.emailOff')}>
                <Mail className="h-3.5 w-3.5" /> {t('report.email')}
              </Button>
              <Button variant="ghost" size="sm" onClick={smsReport} loading={busy === 'SMS'} disabled={!services.sms || !data.mobile} title={services.sms ? undefined : t('report.smsOff')}>
                <MessageSquare className="h-3.5 w-3.5" /> {t('report.sms')}
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={aiDraft} loading={busy === 'AI'} disabled={!services.ai} title={services.ai ? undefined : t('ai.off')}>
            <Sparkles className="h-3.5 w-3.5" /> {t('ai.analyze')}
          </Button>
          {!data.hasHistory && <span className="text-xs text-subtle">{t('report.noHistory')}</span>}
        </div>
      </div>
      <div ref={sheet}>
        {ready ? (
          <ReportDocument data={data} showActions={false} withHistory={withHistory} letterhead={letterhead} />
        ) : (
          // Same card the sheet sits in, holding the page's height for the one
          // frame before the stored print choices are known.
          <div className="card min-h-[70vh] space-y-3 p-4 sm:p-8" aria-hidden>
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton h-40 w-full" />
          </div>
        )}
      </div>
      {/* Arrives after a slow request, so it sits under the sheet rather than
          pushing the report down while someone is reading it. */}
      {aiText && (
        <div className="no-print rounded-xl border border-brand-500/25 bg-brand-500/[0.05] p-4 text-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-strong"><Sparkles className="h-4 w-4" /> {t('ai.draftTitle')}</span>
            <button type="button" onClick={() => setAiText(null)} className="text-xs font-semibold text-muted hover:text-strong">{t('common.close')}</button>
          </div>
          <p className="whitespace-pre-wrap text-body">{aiText}</p>
          <p className="mt-2 text-xs text-subtle">{t('ai.disclaimer')}</p>
        </div>
      )}
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
