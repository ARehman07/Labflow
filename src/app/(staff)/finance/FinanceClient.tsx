'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Plus, ArrowDownLeft, ArrowUpRight, Info, Wallet, Landmark, CreditCard, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Segmented } from '@/components/ui/Segmented';
import { Badge } from '@/components/ui/Badge';
import { ACCENT, SectionHeading, RailGroup } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { cn, formatPkr } from '@/lib/utils';
import {
  getFinanceAction,
  addLedgerEntryAction,
  type FinanceSummary,
  type LedgerRow,
} from '@/modules/finance/finance.actions';
import { Tr } from '@/components/ui/Tr';

/**
 * The day's money, told as one arithmetic story rather than four tiles that
 * never say how they relate. Everything that came in, everything that went out,
 * and the single figure they add up to — in that order, so the page reads.
 */

/** Categories a lab types over and over; offered as one tap instead. */
const COMMON_CATEGORIES: Record<'EXPENSE' | 'INCOME', string[]> = {
  EXPENSE: ['Rent', 'Salary', 'Reagents', 'Utilities', 'Maintenance', 'Transport'],
  INCOME: ['Cash sale', 'Camp collection', 'Partner lab', 'Other'],
};

const METHODS = [
  { key: 'CASH', labelKey: 'finance.methodCash', icon: Wallet },
  { key: 'BANK', labelKey: 'finance.methodBank', icon: Landmark },
  { key: 'CARD', labelKey: 'finance.methodCard', icon: CreditCard },
] as const;

export function FinanceClient({ initialDate, canAddEntry }: { initialDate: string; canAddEntry: boolean }) {
  const { t } = useI18n();
  const [date, setDate] = useState(initialDate);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback((d: string) => {
    setLoading(true);
    getFinanceAction(d)
      .then((r) => { setSummary(r.summary); setLedger(r.ledger); })
      .catch(() => { setSummary(null); setLedger([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(date), [date, load]);

  const moneyIn = summary ? summary.totalCollected + summary.otherIncome : 0;
  const moneyOut = summary ? summary.refunds + summary.expenses : 0;

  return (
    <div className="page">
      <PageHeader
        title={t('finance.title')}
        subtitle={t('finance.subtitle')}
        actions={<DayPicker value={date} onChange={setDate} />}
      />

      {summary && (
        <Card className="p-5">
          {/* The answer first, then the working that produced it. */}
          <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">
            {t('finance.netForDay')}
          </div>
          <div
            className={cn(
              'mt-1 text-[40px] font-extrabold leading-none tracking-tight tabular-nums',
              summary.netCash < 0 ? 'text-danger-text' : 'text-strong',
            )}
          >
            {formatPkr(summary.netCash)}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-subtle">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('finance.netHint')}
          </p>

          {/* The other question asked every evening: does the till match? */}
          <div className="mt-4 rounded-xl bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                {t('finance.cashInDrawer')}
              </span>
              <span
                className={cn(
                  'text-2xl font-extrabold tabular-nums',
                  summary.cashInDrawer < 0 ? 'text-danger-text' : 'text-strong',
                )}
              >
                {formatPkr(summary.cashInDrawer)}
              </span>
            </div>
            <p className="mt-1 text-xs text-subtle">{t('finance.cashHint')}</p>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <section>
              <SectionHeading accent={ACCENT.emerald}>{t('finance.moneyIn')}</SectionHeading>
              <RailGroup accent={ACCENT.emerald}>
                <MoneyRow label={t('finance.patientPayments')} amount={summary.totalCollected} sign="+" />
                <MoneyRow label={t('finance.otherIncome')} amount={summary.otherIncome} sign="+" />
                <MoneyRow label={t('finance.moneyIn')} amount={moneyIn} sign="+" total />
              </RailGroup>
            </section>

            <section>
              <SectionHeading accent={ACCENT.rose}>{t('finance.moneyOut')}</SectionHeading>
              <RailGroup accent={ACCENT.rose}>
                <MoneyRow label={t('finance.refunds')} amount={summary.refunds} sign="−" />
                <MoneyRow
                  label={t('finance.expenses')}
                  amount={summary.expenses}
                  sign="−"
                  meta={summary.cashExpenses > 0 && summary.cashExpenses !== summary.expenses
                    ? `${formatPkr(summary.cashExpenses)} ${t('finance.fromDrawer')}`
                    : undefined}
                />
                <MoneyRow label={t('finance.moneyOut')} amount={moneyOut} sign="−" total />
              </RailGroup>
            </section>
          </div>
        </Card>
      )}

      {summary && (
        <Card className="p-5">
          <SectionHeading meta={t('finance.howPaidHint')}>{t('finance.howPaid')}</SectionHeading>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <MethodStat label={t('finance.cash')} value={summary.byMethod.CASH} total={summary.totalCollected} />
            <MethodStat label={t('finance.card')} value={summary.byMethod.CARD} total={summary.totalCollected} />
            <MethodStat label={t('finance.online')} value={summary.byMethod.ONLINE} total={summary.totalCollected} />
          </div>
        </Card>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-strong">{t('finance.ledger')}</h2>
            <p className="text-xs text-subtle">{t('finance.entriesOnly')}</p>
          </div>
          {canAddEntry && !showAdd && (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> {t('finance.addEntry')}
            </Button>
          )}
        </div>

        {showAdd && (
          <AddEntryForm onCancel={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(date); }} />
        )}

        <Card className={cn('p-2', showAdd && 'mt-3')}>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : ledger.length === 0 ? (
            <p className="px-2 py-6 text-center text-subtle">{t('finance.noEntries')}</p>
          ) : (
            <ul className="space-y-0.5">
              {ledger.map((r) => {
                const income = r.type === 'INCOME';
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        income
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
                      )}
                    >
                      {income ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-body">{r.category}</span>
                        {/* Badge handles both themes; the old hand-rolled pill was light-only. */}
                        <Badge tone={income ? 'success' : 'warning'} size="sm">
                          {t(`finance.${r.type.toLowerCase()}`)}
                        </Badge>
                      </span>
                      <span className="block truncate text-xs text-subtle">
                        {r.time} · {t(`finance.method${r.method.charAt(0)}${r.method.slice(1).toLowerCase()}`)}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-sm font-bold tabular-nums',
                        income ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300',
                      )}
                    >
                      {income ? '+' : '−'} {formatPkr(r.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MoneyRow({
  label, amount, sign, total, meta,
}: { label: string; amount: number; sign: '+' | '−'; total?: boolean; meta?: string }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 px-2 py-1.5',
        total ? 'mt-0.5 font-bold text-strong' : 'text-muted',
      )}
    >
      <span className="min-w-0 truncate text-sm">
        {label}
        {meta && <span className="ms-1.5 text-xs text-subtle">({meta})</span>}
      </span>
      <span className="shrink-0 text-sm tabular-nums">
        {amount === 0 && !total ? formatPkr(0) : `${sign} ${formatPkr(amount)}`}
      </span>
    </div>
  );
}

function MethodStat({ label, value, total }: { label: string; value: number; total: number }) {
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-lg font-bold tabular-nums text-body">{formatPkr(value)}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5 text-xs">
        <span className="text-muted">{label}</span>
        {total > 0 && <span className="tabular-nums text-subtle">{share}%</span>}
      </div>
    </div>
  );
}

function AddEntryForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [method, setMethod] = useState<'CASH' | 'BANK' | 'CARD'>('CASH');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addLedgerEntryAction({ type, method, category, amount, note });
      if (res.ok) { toast('success', t('finance.save')); onDone(); }
      else { setError(res.error ?? 'Failed'); toast('error', res.error ?? 'Failed'); }
    });
  }

  return (
    <Card className="animate-fade-in-up p-5">
      <p className="text-xs text-subtle">{t('finance.addEntryHint')}</p>

      {/* Direction is the first decision and the one that changes the sign, so
          it is two plain-language options rather than a dropdown labelled "Type". */}
      <div className="mt-3">
        <Segmented
          value={type}
          onChange={(k) => { setType(k); setCategory(''); }}
          ariaLabel={t('finance.addEntryHint')}
          options={[
            { value: 'EXPENSE', label: t('finance.recordOut'), icon: <ArrowUpRight className="h-4 w-4 shrink-0" /> },
            { value: 'INCOME', label: t('finance.recordIn'), icon: <ArrowDownLeft className="h-4 w-4 shrink-0" /> },
          ]}
        />
      </div>

      {/* Which pocket the money moved through — this is what makes the drawer
          figure real rather than an assumption. */}
      <div className="mt-4">
        <span className="label">{type === 'EXPENSE' ? t('finance.paidHow') : t('finance.receivedHow')}</span>
        <Segmented
          value={method}
          onChange={setMethod}
          options={METHODS.map((m) => ({ value: m.key, label: t(m.labelKey) }))}
        />
        <p className="mt-1.5 text-[11px] text-subtle">{t('finance.methodHint')}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fin-category">{t('finance.categoryHint')}</label>
          <input
            id="fin-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={COMMON_CATEGORIES[type].slice(0, 3).join(', ') + '…'}
            className="field"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-subtle">{t('finance.commonCategories')}</span>
            {COMMON_CATEGORIES[type].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  category === c
                    ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300'
                    : 'bg-surface-3 text-muted hover:text-body',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="fin-amount">{t('finance.amount')}</label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-sm font-semibold text-subtle">
              Rs
            </span>
            <input
              id="fin-amount"
              type="number"
              min={0}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="field ps-10 tabular-nums"
            />
          </div>
          <label className="label mt-3" htmlFor="fin-note">{t('finance.note')}</label>
          <input id="fin-note" value={note} onChange={(e) => setNote(e.target.value)} className="field" />
        </div>
      </div>

      {error && <p className="note-danger mt-3"><Tr text={error} /></p>}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={submit} loading={isPending} disabled={!category || !amount || Number(amount) <= 0}>
          {t('finance.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </Card>
  );
}

/** YYYY-MM-DD in local time. toISOString() is UTC — before 5am in Pakistan that is still yesterday. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDay(iso: string, by: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + by));
}

/**
 * Which day's money to show.
 *
 * The browser's own date box printed "09/11/2026" in whatever format the
 * browser was set to — read in Pakistan as 9 November, when it meant 11
 * September. This always spells the date out, and steps a day at a time,
 * which is how an owner actually moves through the book.
 */
function DayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const today = isoDay(new Date());
  const [y, m, d] = value.split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(y, m - 1, d));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="icon" onClick={() => onChange(shiftDay(value, -1))}
        aria-label={t('finance.prevDay')} title={t('finance.prevDay')}>
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
      </Button>
      <label className="field relative flex w-auto cursor-pointer items-center gap-2 py-2 font-semibold tabular-nums">
        <CalendarDays className="h-4 w-4 text-subtle" aria-hidden />
        {label}
        <input
          type="date"
          value={value}
          max={today}
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch { /* older browsers */ } }}
          aria-label={t('finance.date')}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Button variant="outline" size="icon" onClick={() => onChange(shiftDay(value, 1))} disabled={value >= today}
        aria-label={t('finance.nextDay')} title={t('finance.nextDay')}>
        <ChevronRight className="h-4 w-4 rtl:rotate-180" />
      </Button>
      {value !== today && (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>{t('finance.today')}</Button>
      )}
    </div>
  );
}
