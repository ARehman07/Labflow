'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Wallet, AlertCircle, FileClock, Files, X,
  IdCard, Phone, CalendarDays, Stethoscope, FlaskConical, ArrowDownLeft, ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { cn, formatPkr } from '@/lib/utils';
import { INVOICE_STATUS } from '@/lib/status';
import {
  listInvoicesAction,
  getBillingSummaryAction,
  getInvoiceDetailAction,
  recordPaymentAction,
  issueRefundAction,
  type InvoiceDTO,
  type InvoiceDetailDTO,
  type BillingSummaryDTO,
} from '@/modules/billing/billing.actions';

type Filter = 'ALL' | 'DUE' | 'PAID';

/** Mirrors the `take` in billing.repository.listInvoices. */
const LIST_CAP = 80;

const METHOD_TONE: Record<string, 'success' | 'info' | 'purple' | 'neutral'> = {
  CASH: 'success', CARD: 'info', ONLINE: 'purple', MIXED: 'neutral',
};

export function BillingClient({
  canRefund, initialInvoices, initialSummary,
}: {
  canRefund: boolean;
  initialInvoices: InvoiceDTO[];
  initialSummary: BillingSummaryDTO;
}) {
  const { t } = useI18n();
  const [invoices, setInvoices] = useState<InvoiceDTO[]>(initialInvoices);
  const [summary, setSummary] = useState<BillingSummaryDTO | null>(initialSummary);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback((f: Filter, q?: string) => {
    setLoading(true);
    Promise.all([listInvoicesAction(f, q), getBillingSummaryAction()])
      .then(([inv, sum]) => { setInvoices(inv); setSummary(sum); })
      .catch(() => { setInvoices([]); })
      .finally(() => setLoading(false));
  }, []);

  // The server already rendered ALL/no-query, so skip the fetch that would
  // otherwise fire on mount and re-request exactly that.
  const mounted = useRef(false);
  const deb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    clearTimeout(deb.current);
    deb.current = setTimeout(() => load(filter, query || undefined), 300);
    return () => clearTimeout(deb.current);
  }, [query, filter, load]);

  const methodLabel = (m: string | null) => (m ? t(`billing.method${m}`) : t('billing.methodNone'));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('billing.title')}</h1>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile icon={Wallet} tone="emerald" label={t('billing.sumCollected')} value={summary ? formatPkr(summary.collected) : '—'} />
        <SummaryTile icon={AlertCircle} tone="amber" label={t('billing.sumOutstanding')} value={summary ? formatPkr(summary.outstanding) : '—'} />
        <SummaryTile icon={FileClock} tone="rose" label={t('billing.sumDue')} value={summary ? String(summary.dueCount) : '—'} />
        <SummaryTile icon={Files} tone="indigo" label={t('billing.sumTotal')} value={summary ? String(summary.total) : '—'} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-surface-3 p-1">
          {(['ALL', 'DUE', 'PAID'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn('rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
                filter === f ? 'bg-surface text-brand-700 shadow-sm' : 'text-muted hover:text-body')}
            >
              {t(`billing.filter${f.charAt(0) + f.slice(1).toLowerCase()}`)}
            </button>
          ))}
        </div>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 h-4 w-4 text-subtle" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('billing.search')} className="field ps-10" />
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t('billing.patient')}</th>
                <th className="px-4 py-3 text-end font-semibold">{t('billing.net')}</th>
                <th className="px-4 py-3 text-end font-semibold">{t('billing.status')}</th>
                <th className="w-10 px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-subtle">{t('common.loading')}</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-14 text-center text-subtle">{t('billing.none')}</td></tr>
              ) : (
                invoices.map((inv) => {
                  const paid = inv.balance <= 0;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setOpenId(inv.id)}
                      className="group cursor-pointer transition-colors hover:bg-surface-2"
                    >
                      {/* Patient identity — everything secondary merged into one muted line */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-bold text-muted ring-1 ring-line">
                            {inv.patientName.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-body">{inv.patientName}</div>
                            <div className="truncate text-xs text-subtle">
                              #{inv.slipNo} · {inv.mrNo} · {inv.date}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Amount — net prominent, method tucked beneath */}
                      <td className="px-4 py-3.5 text-end">
                        <div className="font-bold tabular-nums text-body">{formatPkr(inv.net)}</div>
                        {inv.method && (
                          <div className="mt-0.5 text-[11px] font-medium text-subtle">{methodLabel(inv.method)}</div>
                        )}
                      </td>

                      {/* Status — a single pill. Unpaid rows carry the amount owed
                          in the pill itself rather than repeating it underneath. */}
                      <td className="px-4 py-3.5 text-end">
                        <Badge tone={INVOICE_STATUS[inv.status]?.tone ?? 'neutral'} dot>
                          {paid ? t(`invoiceStatus.${inv.status}`) : `${formatPkr(inv.balance)} ${t('billing.due')}`}
                        </Badge>
                      </td>

                      <td className="px-5 py-3.5 text-end">
                        <span className="text-subtle transition-colors group-hover:text-brand-600">→</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loading && invoices.length > 0 && (
              <tfoot>
                <tr className="text-sm">
                  <td className="px-5 py-3 font-medium text-muted">
                    {invoices.length} {t(invoices.length === 1 ? 'billing.invoice' : 'billing.invoices')}
                    {/* The query is capped, so say so — otherwise these totals
                        quietly disagree with the tiles above on a busy day. */}
                    {invoices.length >= LIST_CAP && (
                      <span className="ms-1.5 font-normal text-subtle">{t('billing.cappedList')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end font-bold tabular-nums text-strong">
                    {formatPkr(invoices.reduce((n, i) => n + i.net, 0))}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {(() => {
                      const owed = invoices.reduce((n, i) => n + i.balance, 0);
                      return owed > 0 ? (
                        <span className="font-bold tabular-nums text-warn-text">
                          {formatPkr(owed)} {t('billing.due')}
                        </span>
                      ) : (
                        <span className="font-medium text-muted">{t('billing.allSettled')}</span>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {openId && (
        <InvoiceDrawer
          invoiceId={openId}
          canRefund={canRefund}
          onClose={() => setOpenId(null)}
          onChanged={() => load(filter, query || undefined)}
        />
      )}
    </div>
  );
}

function SummaryTile({ icon: Icon, tone, label, value }: { icon: typeof Wallet; tone: string; label: string; value: string }) {
  const TONES: Record<string, string> = {
    emerald: 'bg-ok-soft text-emerald-600', amber: 'bg-warn-soft text-amber-600',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-300', indigo: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  };
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-extrabold leading-none text-strong">{value}</div>
        <div className="mt-1 truncate text-xs font-medium text-muted">{label}</div>
      </div>
    </Card>
  );
}

function InvoiceDrawer({
  invoiceId, canRefund, onClose, onChanged,
}: { invoiceId: string; canRefund: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<InvoiceDetailDTO | null>(null);
  const [mode, setMode] = useState<'NONE' | 'PAY' | 'REFUND'>('NONE');

  const reload = useCallback(() => { getInvoiceDetailAction(invoiceId).then(setD); }, [invoiceId]);
  useEffect(() => reload(), [reload]);

  // Lock background scroll + close on Escape while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const methodLabel = (m: string) => t(`billing.method${m}`);

  const content = (
    <>
      <div className="fixed inset-0 z-[80] animate-fade-in bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed inset-y-0 end-0 z-[90] flex w-full max-w-md animate-slide-in-right flex-col bg-surface-2 shadow-2xl">
        {/* header + hero — kept OUTSIDE the scroll area so the lifted hero isn't clipped */}
        <div className="shrink-0">
          <div className="bg-ink px-5 pb-14 pt-5 text-white">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-base font-bold ring-1 ring-white/15">
                  {(d?.patientName ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="text-base font-bold leading-tight">{d?.patientName ?? t('common.loading')}</div>
                  <div className="text-xs text-subtle">{t('billing.slip')} #{d?.slipNo ?? ''}</div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-2 text-subtle transition-colors hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
          </div>
          {d && (
            <div className="-mt-11 mx-4 rounded-2xl bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{t('billing.net')}</span>
                <Badge tone={INVOICE_STATUS[d.status]?.tone ?? 'neutral'} dot>{t(`invoiceStatus.${d.status}`)}</Badge>
              </div>
              <div className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-strong">{formatPkr(d.net)}</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-ok-soft px-3 py-2">
                  <div className="text-[11px] font-medium text-emerald-600">{t('billing.paid')}</div>
                  <div className="font-bold text-ok-text">{formatPkr(d.paid)}</div>
                </div>
                <div className={cn('rounded-xl px-3 py-2', d.balance > 0 ? 'bg-warn-soft' : 'bg-surface-3')}>
                  <div className={cn('text-[11px] font-medium', d.balance > 0 ? 'text-amber-600' : 'text-muted')}>{t('billing.balance')}</div>
                  <div className={cn('font-bold', d.balance > 0 ? 'text-warn-text' : 'text-muted')}>{formatPkr(d.balance)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!d ? (
          <div className="p-6 text-subtle">{t('common.loading')}</div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto p-4 pt-3">
            {/* Patient details */}
            <div className="rounded-2xl bg-surface p-2 shadow-card">
              <DetailRow icon={IdCard} label={t('reception.mrNo')} value={d.mrNo} />
              {d.mobile && <DetailRow icon={Phone} label={t('reception.mobile')} value={d.mobile} />}
              <DetailRow icon={CalendarDays} label={t('billing.date')} value={d.date} />
              {d.doctorName && <DetailRow icon={Stethoscope} label={t('billing.doctor')} value={d.doctorName} />}
            </div>

            {/* Tests */}
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-subtle">
                <FlaskConical className="h-3.5 w-3.5" /> {t('billing.tests')} · {d.tests.length}
              </div>
              <ul className="space-y-1.5">
                {d.tests.map((tst, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm font-medium text-body">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" /> {tst.name}
                  </li>
                ))}
              </ul>
            </div>

            {/* Breakdown */}
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('billing.breakdown')}</div>
              <div className="space-y-1.5 text-sm">
                <Row label={t('billing.gross')} value={formatPkr(d.gross)} />
                <Row label={t('reception.discount')} value={`− ${formatPkr(d.discount)}`} />
                {d.cardFee > 0 && (
                  <Row label={t('reception.cardFee')} value={`+ ${formatPkr(d.cardFee)}`} />
                )}
                <div className="my-1.5 border-t border-dashed border-line" />
                <Row label={t('billing.net')} value={formatPkr(d.net)} strong />
              </div>
            </div>

            {/* Payment timeline */}
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('billing.paymentHistory')}</div>
              {d.payments.length === 0 && d.refunds.length === 0 ? (
                <p className="py-3 text-center text-sm text-subtle">{t('billing.noPayments')}</p>
              ) : (
                <ul className="space-y-3">
                  {d.payments.map((p, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-soft text-emerald-600"><ArrowDownLeft className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-body">+ {formatPkr(p.amount)}</div>
                        <div className="text-[11px] text-subtle">{p.date}</div>
                      </div>
                      <Badge tone={METHOD_TONE[p.method] ?? 'neutral'} size="sm">{methodLabel(p.method)}</Badge>
                    </li>
                  ))}
                  {d.refunds.map((r, i) => (
                    <li key={`r${i}`} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300"><ArrowUpRight className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-rose-600">− {formatPkr(r.amount)}</div>
                        <div className="truncate text-[11px] text-subtle">{t('billing.refundsLabel')}{r.reason ? ` · ${r.reason}` : ''} · {r.date}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* footer actions */}
        {d && (
          <div className="border-t border-line p-4">
            {mode === 'NONE' ? (
              <div className="flex gap-2">
                {d.balance > 0 && <Button className="flex-1" onClick={() => setMode('PAY')}>{t('billing.collect')}</Button>}
                {canRefund && d.paid > 0 && (
                  <Button variant="outline" className="flex-1" onClick={() => setMode('REFUND')}>{t('billing.refund')}</Button>
                )}
                {d.balance === 0 && !(canRefund && d.paid > 0) && (
                  <Button variant="secondary" className="w-full" onClick={onClose}>{t('billing.close')}</Button>
                )}
              </div>
            ) : (
              <ActionForm
                mode={mode}
                invoiceId={d.id}
                maxAmount={mode === 'PAY' ? d.balance : d.paid}
                onCancel={() => setMode('NONE')}
                onDone={() => { setMode('NONE'); reload(); onChanged(); toast('success', mode === 'PAY' ? t('billing.confirm') : t('billing.confirmRefund')); }}
              />
            )}
          </div>
        )}
      </aside>
    </>
  );

  // Portal to <body> so the overlay isn't confined by any transformed ancestor.
  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-subtle">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-xs font-medium text-subtle">{label}</span>
      <span className="truncate text-sm font-semibold text-body">{value}</span>
    </div>
  );
}
function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex justify-between', strong ? 'font-bold text-strong' : 'text-muted', className)}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function ActionForm({
  mode, invoiceId, maxAmount, onCancel, onDone,
}: { mode: 'PAY' | 'REFUND'; invoiceId: string; maxAmount: number; onCancel: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(maxAmount);
  const [method, setMethod] = useState('CASH');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = mode === 'PAY'
        ? await recordPaymentAction({ invoiceId, amount, method })
        : await issueRefundAction({ invoiceId, amount, reason: reason || undefined });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <div className="animate-fade-in-up space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">{t('billing.amount')}</span>
          <input
            type="number"
            min={0}
            max={maxAmount}
            value={amount}
            onChange={(e) => setAmount(Math.min(maxAmount, Math.max(0, Number(e.target.value) || 0)))}
            className="field"
          />
        </div>
        {mode === 'PAY' ? (
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">{t('billing.method')}</span>
            <Select value={method} onChange={setMethod} options={[
              { value: 'CASH', label: t('billing.cash') },
              { value: 'CARD', label: t('billing.card') },
              { value: 'ONLINE', label: t('billing.online') },
            ]} />
          </div>
        ) : (
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">{t('billing.refundReason')}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="field" />
          </div>
        )}
      </div>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button className="flex-1" onClick={submit} loading={isPending} disabled={amount <= 0}>
          {mode === 'PAY' ? t('billing.confirm') : t('billing.confirmRefund')}
        </Button>
      </div>
    </div>
  );
}
