'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, CheckCircle2, FileDown, HandHeart, History, ImageDown, Loader2, Mail, MessageCircle,
  Lock, MessageSquare, MoreHorizontal, Printer, Send, Sparkles, Stamp, Unlock, Wallet, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonVariants } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ReportDocument } from '@/components/report/ReportDocument';
import { cn, formatPkr } from '@/lib/utils';
import { whatsappLink } from '@/lib/whatsapp';
import { renderTemplate } from '@/modules/messages/templates';
import { exportReport, reportFileName, reportPdfBase64 } from '@/lib/report-export';
import { printElement } from '@/lib/print-isolated';
import { emailReportAction, integrationsStatusAction, smsReportAction } from '@/modules/delivery/delivery.actions';
import { aiInterpretReportAction } from '@/modules/ai/ai.actions';
import { markReportDeliveredAction, markReportPrintedAction, releaseUnpaidReportAction } from '@/modules/lab/lab.actions';
import type { ReportData } from '@/modules/reporting/report.types';

const PREF_HISTORY = 'labflow.report.history';
const PREF_LETTERHEAD = 'labflow.report.letterhead';

/**
 * A released report, with the ways it leaves the lab.
 *
 * There are only two questions at this counter: print it, or send it. So there
 * are two buttons. WhatsApp, SMS and email are four ways of answering the
 * second one and belong together under Send, each saying where it is going and
 * why it cannot go when it cannot — lined up as a row of equal buttons they
 * read as five unrelated features and hid the one that gets used.
 *
 * With history stays out in the open: it is on for most reports, it is decided
 * per report, and it changes what is about to come out of the printer. The
 * settings that are set once and forgotten — whether the paper in the tray
 * already carries the letterhead, saving a copy, the AI draft — sit behind
 * More. Both print choices are remembered on this computer.
 */
export function StaffReport({
  visitId, data, canRelease, labName, portalLink, delivered, printed, waTemplate, patientEmail, hold, canReleaseUnpaid,
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
  /** Shown under Email, so a missing address is seen before the click, not after. */
  patientEmail: string | null;
  /** Money due on the slip, when the lab holds reports until paid (billing/report-hold). */
  hold: { held: boolean; due: number; invoiceId: string | null; releasedReason: string | null };
  /** May let a held report out anyway, with a reason. */
  canReleaseUnpaid: boolean;
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

  // While the bill holds the report, nothing lets it out: print, save or send.
  const held = hold.held;
  const [releasing, setReleasing] = useState(false);
  const [releaseWhy, setReleaseWhy] = useState('');
  async function releaseUnpaid() {
    setBusy('RELEASE');
    const res = await releaseUnpaidReportAction(visitId, releaseWhy);
    setBusy(null);
    if (res.ok) { toast('success', t('hold.released')); setReleasing(false); router.refresh(); }
    else toast('error', res.error);
  }

  async function print() {
    if (held) return;
    if (canRelease && !printed) {
      const res = await markReportPrintedAction(visitId);
      if (!res.ok) { toast('error', res.error ?? t('hold.blocked')); return; }
    }
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

  const sending = busy === 'WHATSAPP' || busy === 'SMS' || busy === 'EMAIL' || busy === 'PRINT';

  return (
    <div className="page">
      <div className="no-print">
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

              <Toggle
                on={withHistory && data.hasHistory}
                disabled={!data.hasHistory}
                title={data.hasHistory ? undefined : t('report.noHistory')}
                onClick={() => { const v = !withHistory; setWithHistory(v); remember(PREF_HISTORY, v); }}
              >
                <History className="h-3.5 w-3.5" /> {t('report.withHistory')}
              </Toggle>

              <Button variant={delivered ? 'outline' : 'primary'} onClick={print} disabled={held} title={held ? t('hold.blocked') : undefined}>
                <Printer className="h-4 w-4" /> {t('report.print')}
              </Button>

              <Menu
                label={t('report.send')}
                icon={<Send className="h-4 w-4" />}
                loading={sending}
                title={t('report.sendTitle')}
                disabled={held}
                hint={held ? t('hold.blocked') : undefined}
              >
                {(close) => (<>
                  <Row
                    icon={MessageCircle}
                    label={t('report.whatsapp')}
                    sub={data.mobile ?? t('ready.noMobile')}
                    disabled={!data.mobile || !canRelease}
                    onClick={() => { close(); void deliver('WHATSAPP'); }}
                  />
                  <Row
                    icon={MessageSquare}
                    label={t('report.sms')}
                    sub={!services.sms ? t('report.smsOff') : data.mobile ?? t('ready.noMobile')}
                    disabled={!services.sms || !data.mobile || !canRelease}
                    onClick={() => { close(); void smsReport(); }}
                  />
                  <Row
                    icon={Mail}
                    label={t('report.email')}
                    sub={!services.email ? t('report.emailOff') : patientEmail ?? t('report.noEmail')}
                    disabled={!services.email || !patientEmail || !canRelease}
                    onClick={() => { close(); void emailReport(); }}
                  />
                  {canRelease && !delivered && (<>
                    <hr className="my-1.5 border-line" />
                    <Row
                      icon={HandHeart}
                      label={t('report.markHanded')}
                      sub={t('report.handedSub')}
                      onClick={() => { close(); void deliver('PRINT'); }}
                    />
                  </>)}
                </>)}
              </Menu>

              <Menu
                label={t('report.more')}
                icon={<MoreHorizontal className="h-4 w-4" />}
                iconOnly
                variant="ghost"
                loading={busy === 'pdf' || busy === 'png' || busy === 'AI'}
              >
                {(close) => (<>
                  <Heading>{t('report.printOptions')}</Heading>
                  <Row
                    icon={Stamp}
                    label={t('report.optLetterhead')}
                    sub={t('report.optLetterheadOff')}
                    checked={letterhead}
                    onClick={() => { const v = !letterhead; setLetterhead(v); remember(PREF_LETTERHEAD, v); }}
                  />
                  <hr className="my-1.5 border-line" />
                  <Heading>{t('report.saveCopy')}</Heading>
                  <Row
                    icon={FileDown}
                    label={t('report.downloadPdf')}
                    sub={held ? t('hold.blockedShort') : t('report.pdfSub')}
                    disabled={held}
                    onClick={() => { close(); void save('pdf'); }}
                  />
                  <Row
                    icon={ImageDown}
                    label={t('report.downloadPng')}
                    sub={held ? t('hold.blockedShort') : t('report.pngSub')}
                    disabled={held}
                    onClick={() => { close(); void save('png'); }}
                  />
                  <hr className="my-1.5 border-line" />
                  <Row
                    icon={Sparkles}
                    label={t('ai.analyze')}
                    sub={services.ai ? t('report.aiSub') : t('ai.off')}
                    disabled={!services.ai}
                    onClick={() => { close(); void aiDraft(); }}
                  />
                </>)}
              </Menu>
            </>
          }
        />
      </div>

      {held && (
        // Why the report cannot go out, what is owed, and the way through.
        <div className="no-print mt-3 rounded-xl border border-warn-text/30 bg-warn-soft px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Lock className="h-5 w-5 shrink-0 text-warn-text" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-warn-text">
                {t('hold.title').replace('{amount}', formatPkr(hold.due))}
              </p>
              <p className="text-xs text-warn-text/80">{t('hold.body')}</p>
            </div>
            {hold.invoiceId && (
              <Link href={`/billing?invoice=${hold.invoiceId}`} className={buttonVariants({ size: 'sm' })}>
                <Wallet className="h-4 w-4" /> {t('hold.collect')}
              </Link>
            )}
            {canReleaseUnpaid && !releasing && (
              <Button size="sm" variant="ghost" onClick={() => setReleasing(true)}>{t('hold.releaseAnyway')}</Button>
            )}
          </div>
          {canReleaseUnpaid && releasing && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-warn-text/20 pt-3">
              <input
                autoFocus
                value={releaseWhy}
                onChange={(e) => setReleaseWhy(e.target.value)}
                maxLength={300}
                placeholder={t('hold.reasonPh')}
                aria-label={t('hold.reason')}
                className="field min-w-0 flex-1"
              />
              <Button size="sm" variant="ghost" onClick={() => { setReleasing(false); setReleaseWhy(''); }}>{t('common.cancel')}</Button>
              <Button size="sm" onClick={releaseUnpaid} loading={busy === 'RELEASE'} disabled={releaseWhy.trim().length < 5}>
                {t('hold.releaseConfirm')}
              </Button>
            </div>
          )}
        </div>
      )}
      {!held && hold.releasedReason != null && (
        <p className="no-print mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-2 text-xs text-muted">
          <Unlock className="h-3.5 w-3.5 shrink-0" />
          {t('hold.releasedNote').replace('{amount}', formatPkr(hold.due)).replace('{reason}', hold.releasedReason || '—')}
        </p>
      )}

      {/* Held: the sheet can be read on screen but not printed, even with the browser's own Ctrl+P. */}
      <div ref={sheet} className={cn('mt-3', held && 'print:hidden')}>
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

/**
 * A button with a panel under it. The panel is absolutely placed inside the
 * header — nothing here is transformed or clipped, so it needs no portal — and
 * closes on a click outside, on Escape, or on choosing something.
 */
function Menu({
  label, icon, children, variant = 'outline', iconOnly = false, loading = false, title, disabled = false, hint,
}: {
  label: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  variant?: 'outline' | 'ghost';
  iconOnly?: boolean;
  loading?: boolean;
  /** A heading inside the panel, when the panel needs one. */
  title?: string;
  disabled?: boolean;
  /** Said on hover — why it is disabled, when it is. */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <Button
        variant={variant}
        onClick={() => setOpen((o) => !o)}
        loading={loading}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={iconOnly ? label : undefined}
        title={hint ?? (iconOnly ? label : undefined)}
      >
        {icon}{!iconOnly && label}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={title ?? label}
          className="absolute end-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1.5 shadow-dropdown animate-scale-in"
        >
          {title && <Heading>{title}</Heading>}
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** A switch that shows its state without being opened: on is filled. */
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

function Heading({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-subtle">{children}</div>;
}

/**
 * One line of a panel: what it does, and under it where it goes or why it
 * cannot. A tick appears on the lines that are settings rather than actions.
 */
function Row({
  icon: Icon, label, sub, onClick, disabled, checked, busy,
}: {
  icon: LucideIcon;
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  checked?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors',
        disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-surface-2',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', checked ? 'text-brand-600 dark:text-brand-300' : 'text-muted')} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-strong">{label}</span>
        {/* Wraps rather than truncates: the sub line is often the reason a row
            is disabled, and half a reason helps nobody. */}
        {sub && <span className="block break-words text-xs leading-snug text-muted">{sub}</span>}
      </span>
      {busy && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted" />}
      {checked !== undefined && (
        <Check className={cn('mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300', !checked && 'opacity-0')} />
      )}
    </button>
  );
}
