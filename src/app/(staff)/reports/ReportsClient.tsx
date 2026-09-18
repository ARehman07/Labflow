'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Tr } from '@/components/ui/Tr';
import { DatePicker } from '@/components/ui/DatePicker';
import { cn, formatPkr } from '@/lib/utils';
import { downloadCsv } from '@/lib/csv';
import {
  cashFlowReportAction,
  delayedTestsReportAction,
  discountsReportAction,
  doctorTotalsReportAction,
  referralIncentiveReportAction,
  resultSearchReportAction,
  slipsByDateReportAction,
  testParametersReportAction,
  testTotalsReportAction,
} from '@/modules/reports/reports.actions';

type Tab = 'CASH' | 'TESTS' | 'SLIPS' | 'DISCOUNTS' | 'DOCTORS' | 'REFERRAL' | 'RESULTS' | 'DELAYED';
type Named = { id: string; name: string }[];
type Options = { departments: Named; rateGroups: Named; partners: Named; tests: Named; doctors: Named };

const FLAG_FILTERS = ['HIGH', 'LOW', 'CRITICAL'];

/** Holds a value back until it has stopped changing, so typing into a filter is one request, not ten. */
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return dayStr(d); };
const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const fmtDay = (s: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(`${s}T00:00:00`));

/**
 * Management reports, one screen: cash flow, tests, slips per day, discounts
 * and refunds, and delayed tests. Each takes a date range (delayed tests are
 * always "now") and downloads as CSV.
 */
export function ReportsClient({ options, money, results }: { options: Options; money: boolean; results: boolean }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(money ? 'CASH' : 'DELAYED');
  const [rf, setRf] = useState({ testId: '', parameterId: '', flag: '', value: '', min: '', max: '', releasedOnly: true });
  const rfLive = useDebounced(rf, 400);
  const [params, setParams] = useState<{ id: string; name: string; unit: string | null }[]>([]);
  useEffect(() => {
    if (!rf.testId) { setParams([]); return; }
    testParametersReportAction(rf.testId).then(setParams).catch(() => setParams([]));
  }, [rf.testId]);
  const [doctorId, setDoctorId] = useState('');
  const [from, setFrom] = useState(daysAgo(0));
  const [to, setTo] = useState(daysAgo(0));
  const [f, setF] = useState({ departmentId: '', rateGroupId: '', partnerLabId: '' });
  const [data, setData] = useState<unknown>(null);
  // Which tab `data` was loaded for. Right after a switch the old tab's data is
  // still in state, and handing it to the new tab's view crashes it.
  const [dataTab, setDataTab] = useState<Tab | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = tab === 'CASH' ? await cashFlowReportAction(from, to)
        : tab === 'TESTS' ? await testTotalsReportAction(from, to, { departmentId: f.departmentId || undefined, rateGroupId: f.rateGroupId || undefined, partnerLabId: f.partnerLabId || undefined })
        : tab === 'SLIPS' ? await slipsByDateReportAction(from, to)
        : tab === 'DISCOUNTS' ? await discountsReportAction(from, to)
        : tab === 'DOCTORS' ? await doctorTotalsReportAction(from, to)
        : tab === 'REFERRAL' ? await referralIncentiveReportAction(from, to, doctorId)
        : tab === 'RESULTS' ? await resultSearchReportAction(from, to, rfLive)
        : await delayedTestsReportAction();
      setData(r);
      setDataTab(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report could not be loaded.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, f, doctorId, rfLive]);

  useEffect(() => { void load(); }, [load]);

  const tabs: { key: Tab; label: string }[] = [
    ...(money ? [
      { key: 'CASH' as const, label: t('rep.tabCash') },
      { key: 'TESTS' as const, label: t('rep.tabTests') },
      { key: 'SLIPS' as const, label: t('rep.tabSlips') },
      { key: 'DISCOUNTS' as const, label: t('rep.tabDiscounts') },
      { key: 'DOCTORS' as const, label: t('rep.tabDoctors') },
      { key: 'REFERRAL' as const, label: t('rep.tabReferral') },
    ] : []),
    ...(results ? [{ key: 'RESULTS' as const, label: t('rep.tabResults') }] : []),
    { key: 'DELAYED', label: t('rep.tabDelayed') },
  ];

  return (
    <div className="page">
      <PageHeader title={t('rep.title')} subtitle={t('rep.subtitle')} />

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={cn('whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
              tab === x.key ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-muted hover:text-strong')}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab !== 'DELAYED' && (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="label" htmlFor="rep-from">{t('lab.filterFrom')}</label>
            <DatePicker id="rep-from" value={from} max={to} clearable={false} onChange={(v) => v && setFrom(v)} />
          </div>
          <div>
            <label className="label" htmlFor="rep-to">{t('lab.filterTo')}</label>
            <DatePicker id="rep-to" value={to} min={from} clearable={false} onChange={(v) => v && setTo(v)} />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {[{ k: 'rep.today', a: 0, b: 0 }, { k: 'rep.yesterday', a: 1, b: 1 }, { k: 'rep.last7', a: 6, b: 0 }, { k: 'rep.last30', a: 29, b: 0 }].map((p) => (
              <Button key={p.k} size="sm" variant={from === daysAgo(p.a) && to === daysAgo(p.b) ? 'primary' : 'outline'} onClick={() => { setFrom(daysAgo(p.a)); setTo(daysAgo(p.b)); }}>
                {t(p.k)}
              </Button>
            ))}
          </div>
          {tab === 'REFERRAL' && (
            <div className="w-full sm:w-64">
              <Select value={doctorId} onChange={setDoctorId} options={[{ value: '', label: t('rep.anyDoctor') }, ...options.doctors.map((d) => ({ value: d.id, label: d.name }))]} />
            </div>
          )}
          {tab === 'RESULTS' && (
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="label">{t('rg.test')}</span>
                <Select value={rf.testId} onChange={(v) => setRf({ ...rf, testId: v, parameterId: '' })} options={[{ value: '', label: t('rep.anyTest') }, ...options.tests.map((x) => ({ value: x.id, label: x.name }))]} />
              </div>
              <div>
                <span className="label">{t('rep.parameterCol')}</span>
                <Select
                  value={rf.parameterId}
                  onChange={(v) => setRf({ ...rf, parameterId: v })}
                  options={[{ value: '', label: rf.testId ? t('rep.anyParameter') : t('rep.pickTestFirst') }, ...params.map((x) => ({ value: x.id, label: x.unit ? `${x.name} (${x.unit})` : x.name }))]}
                />
              </div>
              <div>
                <span className="label">{t('rep.flag')}</span>
                <Select
                  value={rf.flag}
                  onChange={(v) => setRf({ ...rf, flag: v })}
                  options={[{ value: '', label: t('rep.flagAny') }, { value: 'OUT', label: t('rep.flagOut') }, ...FLAG_FILTERS.map((x) => ({ value: x, label: t(`rep.flag.${x}`) }))]}
                />
              </div>
              <div>
                <span className="label">{t('rep.show')}</span>
                <Select
                  value={rf.releasedOnly ? 'R' : 'A'}
                  onChange={(v) => setRf({ ...rf, releasedOnly: v === 'R' })}
                  options={[{ value: 'R', label: t('rep.releasedOnly') }, { value: 'A', label: t('rep.allSaved') }]}
                />
              </div>
              <div>
                <label className="label" htmlFor="rep-val">{t('rep.valueContains')}</label>
                <input id="rep-val" value={rf.value} onChange={(e) => setRf({ ...rf, value: e.target.value })} maxLength={60} placeholder={t('rep.valueHint')} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="rep-min">{t('rep.min')}</label>
                <input id="rep-min" type="number" step="any" value={rf.min} onChange={(e) => setRf({ ...rf, min: e.target.value })} className="field tabular-nums" />
              </div>
              <div>
                <label className="label" htmlFor="rep-max">{t('rep.max')}</label>
                <input id="rep-max" type="number" step="any" value={rf.max} onChange={(e) => setRf({ ...rf, max: e.target.value })} className="field tabular-nums" />
              </div>
            </div>
          )}
          {tab === 'TESTS' && (
            <div className="grid w-full gap-3 sm:grid-cols-3">
              <Select value={f.departmentId} onChange={(v) => setF({ ...f, departmentId: v })} options={[{ value: '', label: t('lab.anyDepartment') }, ...options.departments.map((d) => ({ value: d.id, label: d.name }))]} />
              <Select value={f.rateGroupId} onChange={(v) => setF({ ...f, rateGroupId: v })} options={[{ value: '', label: t('rep.anyRateGroup') }, ...options.rateGroups.map((d) => ({ value: d.id, label: d.name }))]} />
              <Select value={f.partnerLabId} onChange={(v) => setF({ ...f, partnerLabId: v })} options={[{ value: '', label: t('lab.anyPatients') }, { value: 'NONE', label: t('lab.walkInsOnly') }, ...options.partners.map((d) => ({ value: d.id, label: d.name }))]} />
            </div>
          )}
        </Card>
      )}

      {error && <p className="note-danger"><Tr text={error} /></p>}
      {loading || dataTab !== tab ? <ListSkeleton rows={6} /> : data != null && (
        tab === 'CASH' ? <CashFlow data={data as Awaited<ReturnType<typeof cashFlowReportAction>>} name={`cash-flow-${from}-${to}`} />
          : tab === 'TESTS' ? <TestTotals data={data as Awaited<ReturnType<typeof testTotalsReportAction>>} name={`tests-${from}-${to}`} />
          : tab === 'SLIPS' ? <Slips data={data as Awaited<ReturnType<typeof slipsByDateReportAction>>} name={`slips-${from}-${to}`} />
          : tab === 'DISCOUNTS' ? <Discounts data={data as Awaited<ReturnType<typeof discountsReportAction>>} name={`discounts-refunds-${from}-${to}`} />
          : tab === 'DOCTORS' ? <DoctorTotals data={data as Awaited<ReturnType<typeof doctorTotalsReportAction>>} name={`doctor-totals-${from}-${to}`} />
          : tab === 'REFERRAL' ? <Referral data={data as Awaited<ReturnType<typeof referralIncentiveReportAction>>} name={`referral-incentive-${from}-${to}`} />
          : tab === 'RESULTS' ? <Results data={data as Awaited<ReturnType<typeof resultSearchReportAction>>} name={`tests-by-results-${from}-${to}`} />
          : <Delayed rows={data as Awaited<ReturnType<typeof delayedTestsReportAction>>} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</div>
      <div className={cn('mt-1 text-xl font-extrabold tabular-nums', tone === 'ok' ? 'text-ok-text' : tone === 'warn' ? 'text-warn-text' : tone === 'danger' ? 'text-danger-text' : 'text-strong')}>{value}</div>
    </Card>
  );
}

function Table({ head, children, minWidth = '40rem' }: { head: { label: string; end?: boolean }[]; children: React.ReactNode; minWidth?: string }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
            {head.map((h, i) => <th key={i} className={cn('px-4 py-2.5', h.end ? 'text-end' : 'text-start')}>{h.label}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

function Empty({ cols }: { cols: number }) {
  const { t } = useI18n();
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-muted">{t('rep.empty')}</td></tr>;
}

function Export({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return <Button variant="outline" size="sm" onClick={onClick}><Download className="h-3.5 w-3.5" /> {t('rep.export')}</Button>;
}

function CashFlow({ data, name }: { data: Awaited<ReturnType<typeof cashFlowReportAction>>; name: string }) {
  const { t } = useI18n();
  // Row tint follows xMed's cash flow: refunds red, dues from an earlier booking green, expenses in red text.
  const tint = (r: (typeof data.rows)[number]) =>
    r.kind === 'REFUND' || r.kind === 'PARTNER_REFUND' ? 'bg-danger-soft/50' : r.olderDue ? 'bg-ok-soft/60' : '';
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('rep.moneyIn')} value={formatPkr(data.totals.in)} tone="ok" />
        <Stat label={t('rep.moneyOut')} value={formatPkr(data.totals.out)} tone={data.totals.out > 0 ? 'danger' : undefined} />
        <Stat label={t('rep.net')} value={formatPkr(data.totals.net)} />
        <Stat label={t('rep.duesCollected')} value={formatPkr(data.totals.collectedDues)} />
      </div>
      {data.byAccount.length > 0 && (
        <Table head={[{ label: t('billing.account') }, { label: t('rep.moneyIn'), end: true }, { label: t('rep.moneyOut'), end: true }, { label: t('rep.net'), end: true }]} minWidth="28rem">
          {data.byAccount.map((a) => (
            <tr key={a.account} className="border-b border-line/70">
              <td className="px-4 py-2 font-medium text-body">{a.account}</td>
              <td className="px-4 py-2 text-end tabular-nums">{formatPkr(a.in)}</td>
              <td className="px-4 py-2 text-end tabular-nums text-danger-text">{a.out ? formatPkr(a.out) : ''}</td>
              <td className="px-4 py-2 text-end font-semibold tabular-nums">{formatPkr(a.net)}</td>
            </tr>
          ))}
        </Table>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-ok-soft ring-1 ring-ok-line" /> {t('rep.legendDues')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-danger-soft ring-1 ring-danger-line" /> {t('rep.legendRefund')}</span>
        </p>
        <Export onClick={() => downloadCsv(name, ['Time', 'Type', 'Slip', 'Details', 'Account', 'In', 'Out'], data.rows.map((r) => [fmtTime(r.at), t(`rep.kind.${r.kind}`), r.ref, r.text, r.account, r.amountIn || '', r.amountOut || '']))} />
      </div>
      <Table head={[{ label: t('rep.time') }, { label: t('rep.type') }, { label: t('rep.details') }, { label: t('billing.account') }, { label: t('rep.moneyIn'), end: true }, { label: t('rep.moneyOut'), end: true }]}>
        {data.rows.length === 0 && <Empty cols={6} />}
        {data.rows.map((r, i) => (
          <tr key={i} className={cn('border-b border-line/70', tint(r))}>
            <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtTime(r.at)}</td>
            <td className="px-4 py-2">
              <span className={cn('text-xs font-semibold', r.kind === 'EXPENSE' ? 'text-danger-text' : 'text-body')}>{t(`rep.kind.${r.kind}`)}</span>
              {r.olderDue && <span className="ms-1 text-[10px] font-bold uppercase text-ok-text">{t('rep.oldDue')}</span>}
            </td>
            <td className="px-4 py-2">{r.ref && <span className="me-1.5 font-mono text-xs text-subtle">#{r.ref}</span>}{r.text}</td>
            <td className="px-4 py-2 text-muted">{r.account}</td>
            <td className="px-4 py-2 text-end tabular-nums">{r.amountIn ? formatPkr(r.amountIn) : ''}</td>
            <td className={cn('px-4 py-2 text-end tabular-nums', r.amountOut && 'text-danger-text')}>{r.amountOut ? formatPkr(r.amountOut) : ''}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function TestTotals({ data, name }: { data: Awaited<ReturnType<typeof testTotalsReportAction>>; name: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('rep.testsDone')} value={String(data.totals.count)} />
        <Stat label={t('rep.testRevenue')} value={formatPkr(data.totals.revenue)} />
        <Stat label={t('rep.kinds')} value={String(data.rows.length)} />
      </div>
      {data.totals.unpriced > 0 && <p className="text-xs text-subtle">{t('rep.unpricedNote').replace('{n}', String(data.totals.unpriced))}</p>}
      <div className="flex justify-end">
        <Export onClick={() => downloadCsv(name, ['Test', 'Code', 'Department', 'Count', 'Released', 'Revenue'], data.rows.map((r) => [r.test, r.code, r.department, r.count, r.released, r.revenue]))} />
      </div>
      <Table head={[{ label: t('rg.test') }, { label: t('lab.filterDepartment') }, { label: t('rep.count'), end: true }, { label: t('rep.released'), end: true }, { label: t('rep.revenue'), end: true }]}>
        {data.rows.length === 0 && <Empty cols={5} />}
        {data.rows.map((r) => (
          <tr key={r.code} className="border-b border-line/70">
            <td className="px-4 py-2"><div className="font-medium text-body">{r.test}</div><div className="text-xs text-subtle">{r.code}</div></td>
            <td className="px-4 py-2 text-muted">{r.department}</td>
            <td className="px-4 py-2 text-end font-semibold tabular-nums">{r.count}</td>
            <td className="px-4 py-2 text-end tabular-nums text-muted">{r.released}</td>
            <td className="px-4 py-2 text-end tabular-nums">{formatPkr(r.revenue)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Slips({ data, name }: { data: Awaited<ReturnType<typeof slipsByDateReportAction>>; name: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('rep.slips')} value={String(data.totals.slips)} />
        <Stat label={t('rep.net')} value={formatPkr(data.totals.net)} />
        <Stat label={t('rep.collected')} value={formatPkr(data.totals.paid)} tone="ok" />
        <Stat label={t('rep.due')} value={formatPkr(data.totals.due)} tone={data.totals.due > 0 ? 'warn' : undefined} />
      </div>
      <div className="flex justify-end">
        <Export onClick={() => downloadCsv(name, ['Date', 'Slips', 'Patients', 'Gross', 'Discount', 'Net', 'Paid', 'Due'], data.rows.map((r) => [r.date, r.slips, r.patients, r.gross, r.discount, r.net, r.paid, r.due]))} />
      </div>
      <Table head={[{ label: t('partners.date') }, { label: t('rep.slips'), end: true }, { label: t('rep.patients'), end: true }, { label: t('slip.gross'), end: true }, { label: t('slip.discount'), end: true }, { label: t('rep.net'), end: true }, { label: t('rep.collected'), end: true }, { label: t('rep.due'), end: true }]} minWidth="44rem">
        {data.rows.length === 0 && <Empty cols={8} />}
        {data.rows.map((r) => (
          <tr key={r.date} className="border-b border-line/70">
            <td className="whitespace-nowrap px-4 py-2 font-medium">{fmtDay(r.date)}</td>
            <td className="px-4 py-2 text-end tabular-nums">{r.slips}</td>
            <td className="px-4 py-2 text-end tabular-nums">{r.patients}</td>
            <td className="px-4 py-2 text-end tabular-nums">{formatPkr(r.gross)}</td>
            <td className="px-4 py-2 text-end tabular-nums text-muted">{r.discount ? `− ${formatPkr(r.discount)}` : ''}</td>
            <td className="px-4 py-2 text-end font-semibold tabular-nums">{formatPkr(r.net)}</td>
            <td className="px-4 py-2 text-end tabular-nums text-ok-text">{formatPkr(r.paid)}</td>
            <td className={cn('px-4 py-2 text-end tabular-nums', r.due > 0 && 'text-warn-text')}>{r.due ? formatPkr(r.due) : ''}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Discounts({ data, name }: { data: Awaited<ReturnType<typeof discountsReportAction>>; name: string }) {
  const { t } = useI18n();
  const given = data.discounts.filter((d) => !d.cancelled).reduce((s, d) => s + d.amount, 0);
  const refunded = data.refunds.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label={t('rep.discountsGiven').replace('{n}', String(data.discounts.length))} value={formatPkr(given)} tone={given > 0 ? 'warn' : undefined} />
        <Stat label={t('rep.refundsPaid').replace('{n}', String(data.refunds.length))} value={formatPkr(refunded)} tone={refunded > 0 ? 'danger' : undefined} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-strong">{t('rep.discounts')}</h2>
        <Export onClick={() => downloadCsv(name, ['Date', 'Slip', 'Patient', 'Kind', 'Basis', 'Gross', 'Discount', 'Comments', 'Record'], [
          ...data.discounts.map((d) => [fmtTime(d.date), d.slipNo, d.patient, t(`rep.source.${d.source}`), d.basis, d.gross, d.amount, d.notes, 'Discount']),
          ...data.refunds.map((r) => [fmtTime(r.date), r.slipNo, r.patient, 'Refund', r.account, '', r.amount, r.reason, `Refund by ${r.by ?? ''}`]),
        ])} />
      </div>
      <Table head={[{ label: t('partners.date') }, { label: t('partners.patient') }, { label: t('rep.kindCol') }, { label: t('slip.gross'), end: true }, { label: t('slip.discount'), end: true }, { label: t('reception.notes') }]} minWidth="46rem">
        {data.discounts.length === 0 && <Empty cols={6} />}
        {data.discounts.map((d, i) => (
          <tr key={i} className={cn('border-b border-line/70 align-top', d.cancelled && 'opacity-50')}>
            <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtTime(d.date)}<div className="font-mono text-xs text-subtle">#{d.slipNo}</div></td>
            <td className="px-4 py-2">{d.patient}</td>
            <td className="px-4 py-2"><Badge tone="neutral" size="sm">{t(`rep.source.${d.source}`)}</Badge>{d.basis && <div className="mt-0.5 text-xs text-subtle">{d.basis}</div>}</td>
            <td className="px-4 py-2 text-end tabular-nums text-muted">{formatPkr(d.gross)}</td>
            <td className="px-4 py-2 text-end font-semibold tabular-nums">{formatPkr(d.amount)}</td>
            <td className="px-4 py-2 text-xs text-muted">{d.notes}</td>
          </tr>
        ))}
      </Table>
      <h2 className="text-sm font-semibold text-strong">{t('rep.refunds')}</h2>
      <Table head={[{ label: t('partners.date') }, { label: t('partners.patient') }, { label: t('billing.refundReason') }, { label: t('billing.account') }, { label: t('rep.by') }, { label: t('partners.amount'), end: true }]} minWidth="42rem">
        {data.refunds.length === 0 && <Empty cols={6} />}
        {data.refunds.map((r, i) => (
          <tr key={i} className="border-b border-line/70">
            <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtTime(r.date)}<div className="font-mono text-xs text-subtle">#{r.slipNo}</div></td>
            <td className="px-4 py-2">{r.patient}</td>
            <td className="px-4 py-2 text-muted">{r.reason}</td>
            <td className="px-4 py-2 text-muted">{r.account}</td>
            <td className="px-4 py-2 text-muted">{r.by}</td>
            <td className="px-4 py-2 text-end font-semibold tabular-nums text-danger-text">{formatPkr(r.amount)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Delayed({ rows }: { rows: Awaited<ReturnType<typeof delayedTestsReportAction>> }) {
  const { t } = useI18n();
  const overdue = rows.filter((r) => r.overdue).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('rep.overdue')} value={String(overdue)} tone={overdue > 0 ? 'danger' : 'ok'} />
        <Stat label={t('rep.dueSoon')} value={String(rows.length - overdue)} tone={rows.length - overdue > 0 ? 'warn' : undefined} />
        <Stat label={t('rep.withReason')} value={String(rows.filter((r) => r.delayReason).length)} />
      </div>
      <div className="flex justify-end">
        <Export onClick={() => downloadCsv('delayed-tests', ['Due', 'Slip', 'Patient', 'Mobile', 'Test', 'Department', 'Status', 'Reason', 'Partner', 'Dues pending'], rows.map((r) => [r.dueAt ? fmtTime(r.dueAt) : '', r.slipNo, r.patient, r.mobile, r.test, r.department, t(`status.${r.status}`), r.delayReason, r.partner, r.duesPending ? 'Yes' : '']))} />
      </div>
      <Table head={[{ label: t('rep.dueCol') }, { label: t('partners.patient') }, { label: t('rg.test') }, { label: t('partners.status') }, { label: t('rep.reason') }]} minWidth="44rem">
        {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ok-text">{t('rep.nothingLate')}</td></tr>}
        {rows.map((r) => (
          <tr key={r.id} className={cn('border-b border-line/70 align-top', r.overdue && 'bg-danger-soft/40')}>
            <td className={cn('whitespace-nowrap px-4 py-2 tabular-nums', r.overdue ? 'font-semibold text-danger-text' : 'text-warn-text')}>{r.dueAt ? fmtTime(r.dueAt) : '—'}</td>
            <td className="px-4 py-2">
              <Link href={`/lab?q=${r.slipNo}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.patient}</Link>
              <div className="text-xs text-subtle">#{r.slipNo}{r.partner && ` · ${r.partner}`}{r.duesPending && ` · ${t('rep.duesPending')}`}</div>
            </td>
            <td className="px-4 py-2"><div>{r.test}</div><div className="text-xs text-subtle">{r.department}</div></td>
            <td className="px-4 py-2 text-xs">{t(`status.${r.status}`)}</td>
            <td className="px-4 py-2 text-xs text-muted">{r.delayReason ?? '—'}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function DoctorTotals({ data, name }: { data: Awaited<ReturnType<typeof doctorTotalsReportAction>>; name: string }) {
  const { t } = useI18n();
  const who = (r: (typeof data.rows)[number]) => r.doctor ?? t('rep.selfDoctor');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('rep.doctors')} value={String(data.totals.doctors)} />
        <Stat label={t('rep.slips')} value={String(data.totals.slips)} />
        <Stat label={t('rep.net')} value={formatPkr(data.totals.net)} />
        <Stat label={t('rep.due')} value={formatPkr(data.totals.due)} tone={data.totals.due > 0 ? 'warn' : undefined} />
      </div>
      <div className="flex justify-end">
        <Export onClick={() => downloadCsv(name, ['Doctor', 'Clinic', 'Slips', 'Patients', 'Tests', 'Gross', 'Discount', 'Net', 'Paid', 'Due'], data.rows.map((r) => [who(r), r.clinic, r.slips, r.patients, r.tests, r.gross, r.discount, r.net, r.paid, r.due]))} />
      </div>
      <Table head={[{ label: t('rep.doctorCol') }, { label: t('rep.slips'), end: true }, { label: t('rep.patients'), end: true }, { label: t('rep.tests'), end: true }, { label: t('slip.gross'), end: true }, { label: t('slip.discount'), end: true }, { label: t('rep.net'), end: true }, { label: t('rep.collected'), end: true }, { label: t('rep.due'), end: true }]} minWidth="52rem">
        {data.rows.length === 0 && <Empty cols={9} />}
        {data.rows.map((r) => (
          <tr key={r.doctorId ?? 'self'} className="border-b border-line/70">
            <td className="px-4 py-2">
              <div className={cn('font-medium', r.doctorId ? 'text-body' : 'text-muted')}>{who(r)}</div>
              {r.clinic && <div className="text-xs text-subtle">{r.clinic}</div>}
            </td>
            <td className="px-4 py-2 text-end tabular-nums">{r.slips}</td>
            <td className="px-4 py-2 text-end tabular-nums">{r.patients}</td>
            <td className="px-4 py-2 text-end tabular-nums">{r.tests}</td>
            <td className="px-4 py-2 text-end tabular-nums">{formatPkr(r.gross)}</td>
            <td className="px-4 py-2 text-end tabular-nums text-muted">{r.discount ? `− ${formatPkr(r.discount)}` : ''}</td>
            <td className="px-4 py-2 text-end font-semibold tabular-nums">{formatPkr(r.net)}</td>
            <td className="px-4 py-2 text-end tabular-nums text-ok-text">{formatPkr(r.paid)}</td>
            <td className={cn('px-4 py-2 text-end tabular-nums', r.due > 0 && 'text-warn-text')}>{r.due ? formatPkr(r.due) : ''}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Referral({ data, name }: { data: Awaited<ReturnType<typeof referralIncentiveReportAction>>; name: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('rep.doctors')} value={String(data.totals.doctors)} />
        <Stat label={t('rep.slips')} value={String(data.totals.slips)} />
        <Stat label={t('rep.incentive')} value={formatPkr(data.totals.incentive)} />
        <Stat label={t('rep.unpaid')} value={formatPkr(data.totals.unpaid)} tone={data.totals.unpaid > 0 ? 'warn' : undefined} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-strong">{t('rep.summaryByDoctor')}</h2>
        <Export onClick={() => downloadCsv(name, ['Record', 'Date', 'Doctor', 'Share %', 'Slip', 'Patient', 'Bill', 'Incentive', 'Status'], [
          ...data.summary.map((r) => ['Summary', '', r.doctor, r.pct, r.slips, '', r.bills, r.incentive, `Paid ${r.paid} · Unpaid ${r.unpaid}`]),
          ...data.details.map((d) => ['Slip', fmtTime(d.date), d.doctor, d.pct, d.slipNo, d.patient, d.bill, d.amount, t(`rep.cstatus.${d.status}`)]),
        ])} />
      </div>
      <Table head={[{ label: t('rep.doctorCol') }, { label: t('rep.slips'), end: true }, { label: t('rep.bills'), end: true }, { label: t('rep.incentive'), end: true }, { label: t('rep.paidOut'), end: true }, { label: t('rep.unpaid'), end: true }]} minWidth="40rem">
        {data.summary.length === 0 && <Empty cols={6} />}
        {data.summary.map((r) => (
          <tr key={r.doctorId} className="border-b border-line/70">
            <td className="px-4 py-2"><div className="font-medium text-body">{r.doctor}</div><div className="text-xs text-subtle">{t('rep.share').replace('{pct}', String(r.pct))}</div></td>
            <td className="px-4 py-2 text-end tabular-nums">{r.slips}</td>
            <td className="px-4 py-2 text-end tabular-nums text-muted">{formatPkr(r.bills)}</td>
            <td className="px-4 py-2 text-end font-semibold tabular-nums">{formatPkr(r.incentive)}</td>
            <td className="px-4 py-2 text-end tabular-nums text-ok-text">{r.paid ? formatPkr(r.paid) : ''}</td>
            <td className={cn('px-4 py-2 text-end tabular-nums', r.unpaid > 0 && 'text-warn-text')}>{r.unpaid ? formatPkr(r.unpaid) : ''}</td>
          </tr>
        ))}
      </Table>
      <h2 className="text-sm font-semibold text-strong">{t('rep.everySlip')}</h2>
      <Table head={[{ label: t('partners.date') }, { label: t('partners.patient') }, { label: t('rep.doctorCol') }, { label: t('rep.bills'), end: true }, { label: t('rep.incentive'), end: true }, { label: t('partners.status') }]} minWidth="44rem">
        {data.details.length === 0 && <Empty cols={6} />}
        {data.details.map((d, i) => (
          <tr key={i} className={cn('border-b border-line/70', d.amount < 0 && 'bg-danger-soft/40')}>
            <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtTime(d.date)}<div className="font-mono text-xs text-subtle">#{d.slipNo}</div></td>
            <td className="px-4 py-2">{d.patient}</td>
            <td className="px-4 py-2 text-muted">{d.doctor}</td>
            <td className="px-4 py-2 text-end tabular-nums text-muted">{formatPkr(d.bill)}</td>
            <td className={cn('px-4 py-2 text-end font-semibold tabular-nums', d.amount < 0 && 'text-danger-text')}>
              {d.amount < 0 ? `− ${formatPkr(-d.amount)}` : formatPkr(d.amount)}
              {d.amount < 0 && <div className="text-[10px] font-bold uppercase">{t('rep.reversal')}</div>}
            </td>
            <td className="px-4 py-2 text-xs">{t(`rep.cstatus.${d.status}`)}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-subtle">{t('rep.incentiveNote')}</p>
    </div>
  );
}

function Results({ data, name }: { data: Awaited<ReturnType<typeof resultSearchReportAction>>; name: string }) {
  const { t } = useI18n();
  const flagTone = (f: string) => (f === 'NORMAL' ? 'text-body' : f.startsWith('CRITICAL') ? 'font-bold text-danger-text' : 'font-semibold text-warn-text');
  const ageSex = (r: (typeof data.rows)[number]) =>
    [r.age != null ? `${r.age}${r.ageUnit === 'MONTHS' ? 'm' : r.ageUnit === 'DAYS' ? 'd' : t('common.years')}` : null, r.sex ? t(`reception.${r.sex.toLowerCase()}`) : null].filter(Boolean).join(' / ');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('rep.resultsFound')} value={String(data.totals.results)} />
        <Stat label={t('rep.patients')} value={String(data.totals.patients)} />
        <Stat label={t('rep.flagOut')} value={String(data.totals.outOfRange)} tone={data.totals.outOfRange > 0 ? 'warn' : undefined} />
      </div>
      {data.capped && <p className="note-warn text-sm">{t('rep.resultsCapped')}</p>}
      <div className="flex justify-end">
        <Export onClick={() => downloadCsv(name, ['Date', 'Slip', 'Patient', 'MR#', 'Age/Sex', 'Mobile', 'Test', 'Result line', 'Value', 'Unit', 'Flag', 'Status'], data.rows.map((r) => [fmtTime(r.date), r.slipNo, r.patient, r.mrNo, ageSex(r), r.mobile, r.test, r.parameter, r.value, r.unit, t(`rep.flag.${r.flag}`), t(`status.${r.status}`)]))} />
      </div>
      <Table head={[{ label: t('partners.date') }, { label: t('partners.patient') }, { label: t('rep.parameterCol') }, { label: t('rep.valueCol'), end: true }, { label: t('rep.flag') }, { label: t('partners.status') }]} minWidth="50rem">
        {data.rows.length === 0 && <Empty cols={6} />}
        {data.rows.map((r) => (
          <tr key={r.id} className="border-b border-line/70 align-top">
            <td className="whitespace-nowrap px-4 py-2 tabular-nums">
              {fmtTime(r.date)}
              <div><Link href={`/lab/report/${r.visitId}`} className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300">#{r.slipNo}</Link></div>
            </td>
            <td className="px-4 py-2">
              <div className="font-medium text-body">{r.patient}</div>
              <div className="text-xs text-subtle">{r.mrNo}{ageSex(r) && ` · ${ageSex(r)}`}</div>
            </td>
            <td className="px-4 py-2"><div>{r.parameter}</div><div className="text-xs text-subtle">{r.test}</div></td>
            <td className={cn('whitespace-nowrap px-4 py-2 text-end tabular-nums', flagTone(r.flag))}>
              {r.value}{r.unit && <span className="ms-1 text-xs font-normal text-subtle">{r.unit}</span>}
            </td>
            <td className="px-4 py-2 text-xs">{r.flag === 'NORMAL' ? '' : t(`rep.flag.${r.flag}`)}</td>
            <td className="px-4 py-2 text-xs text-muted">{t(`status.${r.status}`)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
