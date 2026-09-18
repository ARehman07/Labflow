'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Trash2 } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { formatPkr } from '@/lib/utils';
import { FEATURE_GROUPS } from '@/core/features/catalog';
import { paymentPeriod, type AccessLevel } from '@/core/billing/access';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  recordLabPaymentAction, removeLabAction, resetLabUserPasswordAction, setAccessOverrideAction,
  setLabActiveAction, setLabUserActiveAction, setLockedFeaturesAction, updatePlanAction,
} from '@/modules/platform/platform.actions';
import { AccessBadge } from '../../AccessBadge';

interface LabData {
  id: string; code: string; name: string; isActive: boolean; created: string;
  access: { level: AccessLevel; reason: string; restrictsOn: string | null };
  plan: { planName: string; monthlyFee: number; graceDays: number; maxUsers: number | null; paidUntil: string; accessOverride: string; overrideUntil: string };
  counts: { users: number; branches: number; patients: number; bookings: number };
  activeStaff: number; lastLogin: string | null; lastBooking: string | null; locked: string[];
  users: { id: string; fullName: string; username: string; role: string; isActive: boolean; mustChangePassword: boolean; lastLoginAt: string | null; portal: string | null }[];
  payments: { id: string; paidAt: string; amount: number; months: number; period: string; method: string | null; reference: string | null; note: string | null; recordedBy: string }[];
  audit: { id: string; at: string; who: string | null; entity: string; action: string }[];
  events: { id: string; at: string; admin: string; action: string; detail: string | null }[];
}

const REASON: Record<string, string> = {
  SUSPENDED: 'Suspended — nobody at this lab can use LabFlow.',
  RESTRICTED: 'Restricted by hand — read-only until you change it.',
  KEPT_OPEN: 'Kept open by hand, whatever the payments say.',
  PAID: 'Paid up.',
  NO_BILLING: 'Billing is not set up, so access is not limited.',
  GRACE: 'Payment overdue — full access during the grace days.',
  OVERDUE: 'Payment overdue and the grace days are over — read-only.',
};

const EVENT: Record<string, string> = {
  CREATE: 'Created', SUSPEND: 'Suspended', REACTIVATE: 'Reactivated', PLAN: 'Plan changed', PAYMENT: 'Payment recorded',
  ACCESS: 'Access changed', FEATURES: 'Plan features changed', USER_ON: 'Account switched on', USER_OFF: 'Account switched off',
  RESET_PASSWORD: 'Password reset', RESET_OWNER: 'Owner password reset', REMOVE: 'Removed',
};

const btn = 'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-body transition-colors hover:bg-surface-2 disabled:opacity-60';
const primary = 'rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60';

function Section({ title, hint, children, danger }: { title: string; hint?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={`card p-5 ${danger ? 'border-danger-line' : ''}`}>
      <h2 className={`section-title ${danger ? 'text-danger-text' : ''}`}>{title}</h2>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function LabDetail({ lab }: { lab: LabData }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await fn();
      if (res.ok) { if (done) setNotice(done); router.refresh(); } else setError(res.error ?? 'Something went wrong.');
    });
  };

  const [plan, setPlan] = useState({ ...lab.plan, maxUsers: lab.plan.maxUsers == null ? '' : String(lab.plan.maxUsers) });
  // A payment covers the days picked here. The suggestion is the month after
  // the current paid-until (or from today, if that has passed); the admin can
  // change either end — say, to log September after setting 30 Sept by hand.
  const suggestPeriod = () => {
    const p = paymentPeriod(lab.plan.paidUntil ? localDay(lab.plan.paidUntil) : null, 1);
    return { from: isoDay(p.from), until: isoDay(p.to) };
  };
  const [pay, setPay] = useState({
    amount: lab.plan.monthlyFee > 0 ? String(lab.plan.monthlyFee) : '', ...suggestPeriod(), untilTouched: false,
    method: '', reference: '', note: '',
  });
  // Once a payment moves paid-until, the next suggestion follows it.
  useEffect(() => {
    setPay((p) => ({ ...p, ...suggestPeriod(), untilTouched: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.plan.paidUntil]);
  const newPaidUntil = pay.until && (!lab.plan.paidUntil || pay.until > lab.plan.paidUntil) ? pay.until : lab.plan.paidUntil;
  const [override, setOverride] = useState({ mode: lab.plan.accessOverride, until: lab.plan.overrideUntil });
  const [locked, setLocked] = useState<string[]>(lab.locked);
  const [reset, setReset] = useState<{ username: string; password: string } | null>(null);
  const [typed, setTyped] = useState('');

  const stats: [string, string][] = [
    ['Staff accounts', lab.plan.maxUsers != null ? `${lab.activeStaff} of ${lab.plan.maxUsers}` : String(lab.activeStaff)],
    ['Branches', String(lab.counts.branches)], ['Patients', String(lab.counts.patients)], ['Bookings', String(lab.counts.bookings)],
    ['Last sign-in', lab.lastLogin ?? '—'], ['Last booking', lab.lastBooking ?? '—'],
  ];

  return (
    <div className="space-y-5">
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-strong"><ArrowLeft className="h-4 w-4" /> Labs</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-strong">{lab.name} <AccessBadge level={lab.access.level} /></h1>
          <p className="text-sm text-muted"><span className="font-mono">{lab.code}</span> · created {lab.created}</p>
          <p className="mt-1 text-sm text-body">{REASON[lab.access.reason]}{lab.access.restrictsOn && ` Turns read-only after ${lab.access.restrictsOn}.`}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(lab.isActive ? `Suspend ${lab.name}? Nobody at this lab can use LabFlow until it is reactivated.` : `Reactivate ${lab.name}?`)) return;
            run(() => setLabActiveAction(lab.id, !lab.isActive));
          }}
          className={lab.isActive ? 'rounded-xl border border-danger-line px-4 py-2 text-sm font-semibold text-danger-text transition-colors hover:bg-danger-soft disabled:opacity-60' : primary}
        >
          {lab.isActive ? 'Suspend lab' : 'Reactivate lab'}
        </button>
      </div>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
      {notice && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok-text">{notice}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</div>
            <div className="mt-1 truncate text-lg font-extrabold tabular-nums text-strong">{value}</div>
          </div>
        ))}
      </div>

      <Section title="Subscription" hint="Leave “Paid until” empty for a lab that is not billed; its access is then never limited.">
        <div className="grid gap-3 sm:grid-cols-5">
          <label className="sm:col-span-2"><span className="label">Plan name</span><input value={plan.planName} onChange={(e) => setPlan({ ...plan, planName: e.target.value })} maxLength={60} placeholder="Standard" className="field" /></label>
          <label><span className="label">Monthly fee (Rs)</span><input type="number" min={0} value={plan.monthlyFee} onChange={(e) => setPlan({ ...plan, monthlyFee: Number(e.target.value) || 0 })} className="field tabular-nums" /></label>
          <label><span className="label">Grace days</span><input type="number" min={0} max={60} value={plan.graceDays} onChange={(e) => setPlan({ ...plan, graceDays: Number(e.target.value) || 0 })} className="field tabular-nums" /></label>
          <label><span className="label">Staff limit</span><input type="number" min={1} value={plan.maxUsers} onChange={(e) => setPlan({ ...plan, maxUsers: e.target.value })} placeholder="No limit" className="field tabular-nums" /></label>
          <div className="sm:col-span-2"><span className="label">Paid until</span><DatePicker value={plan.paidUntil} onChange={(v) => setPlan({ ...plan, paidUntil: v })} placeholder="Not billed" /></div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={pending} onClick={() => run(() => updatePlanAction(lab.id, plan), 'Plan saved.')} className={primary}>Save plan</button>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-strong">Record a payment</h3>
          <p className="text-xs text-subtle">Pick the days this payment covers. “Paid until” moves to the last of them — never back.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label><span className="label">Amount (Rs)</span><input type="number" min={0} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="field tabular-nums" /></label>
            <div>
              <span className="label">From</span>
              <DatePicker
                value={pay.from}
                clearable={false}
                onChange={(v) => v && setPay((p) => ({ ...p, from: v, until: p.untilTouched && p.until >= v ? p.until : monthOn(v) }))}
              />
            </div>
            <div>
              <span className="label">Until</span>
              <DatePicker
                value={pay.until}
                min={pay.from}
                clearable={false}
                onChange={(v) => v && setPay((p) => ({ ...p, until: v, untilTouched: true }))}
              />
            </div>
            <label><span className="label">Method</span><input value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} maxLength={40} placeholder="Bank transfer" className="field" /></label>
            <label className="sm:col-span-2"><span className="label">Reference</span><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} maxLength={80} placeholder="Transaction ID" className="field" /></label>
          </div>
          <p className="mt-3 text-sm text-body">
            Covers <b className="font-semibold">{longDay(pay.from)} – {longDay(pay.until)}</b>
            {' · '}
            {newPaidUntil !== lab.plan.paidUntil
              ? <>“Paid until” becomes <b className="font-semibold">{longDay(newPaidUntil)}</b></>
              : <>“Paid until” stays <b className="font-semibold">{longDay(lab.plan.paidUntil)}</b></>}
          </p>
          <div className="mt-3 flex justify-end">
            <button type="button" disabled={pending || !(Number(pay.amount) > 0)} onClick={() => run(() => recordLabPaymentAction(lab.id, {
              amount: pay.amount, from: pay.from, until: pay.until, method: pay.method, reference: pay.reference, note: pay.note,
            }), 'Payment recorded.')} className={primary}>Record payment</button>
          </div>
        </div>

        {lab.payments.length > 0 && (
          <div className="mt-5 overflow-x-auto border-t border-line pt-3">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                  <th className="py-2 text-start">Recorded</th><th className="py-2 text-start">Covers</th><th className="py-2 text-start">Method</th><th className="py-2 text-start">By</th><th className="py-2 text-end">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lab.payments.map((p) => (
                  <tr key={p.id} className="border-t border-line/60">
                    <td className="py-2 whitespace-nowrap">{p.paidAt}</td>
                    <td className="py-2 text-muted">{p.period} ({p.months} mo)</td>
                    <td className="py-2 text-muted">{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="py-2 text-muted">{p.recordedBy}</td>
                    <td className="py-2 text-end font-semibold tabular-nums">{formatPkr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Access" hint="Read-only keeps released reports viewable and printable; nothing can be booked, entered, paid or changed.">
        <div className="space-y-2 text-sm">
          {[
            ['NONE', 'Follow payment', 'Active while paid, a warning during the grace days, then read-only.'],
            ['ACTIVE', 'Keep open', 'Full access whatever the payments say — until the date below, or until you change it.'],
            ['READ_ONLY', 'Restrict now', 'Read-only straight away, even if paid.'],
          ].map(([value, label, desc]) => (
            <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
              <input type="radio" name="override" checked={override.mode === value} onChange={() => setOverride({ ...override, mode: value })} className="mt-1 accent-brand-600" />
              <span><span className="font-semibold text-body">{label}</span><span className="block text-xs text-subtle">{desc}</span></span>
            </label>
          ))}
          {override.mode === 'ACTIVE' && (
            <div className="block max-w-xs"><span className="label">Keep open until (optional)</span><DatePicker value={override.until} onChange={(v) => setOverride({ ...override, until: v })} placeholder="No end date" /></div>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={pending} onClick={() => run(() => setAccessOverrideAction(lab.id, override), 'Access saved.')} className={primary}>Save access</button>
        </div>
      </Section>

      <Section title="Plan features" hint="Untick what this lab’s plan does not include. The owner sees it as “Not in your plan” and cannot switch it on.">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURE_GROUPS.map((g) => (
            <div key={g.group}>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">{t(`feat.group.${g.group}`)}</div>
              <ul className="space-y-1">
                {g.keys.map((k) => (
                  <li key={k}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
                      <input type="checkbox" checked={!locked.includes(k)} onChange={(e) => setLocked(e.target.checked ? locked.filter((x) => x !== k) : [...locked, k])} className="h-4 w-4 accent-brand-600" />
                      {t(`feat.${k}`)}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={pending} onClick={() => run(() => setLockedFeaturesAction(lab.id, locked), 'Plan features saved.')} className={primary}>Save plan features</button>
        </div>
      </Section>

      <Section title={`Users (${lab.users.length})`} hint="Switch off an account the lab cannot reach, or reset anyone’s password. A reset password must be changed at next sign-in.">
        {reset && (
          <div className="mb-3 rounded-xl border border-ok-line bg-ok-soft px-4 py-3 text-sm text-ok-text">
            New one-time password for <b className="font-mono">{reset.username}</b>: <b className="select-all font-mono">{reset.password}</b>
            <div className="mt-0.5 text-xs opacity-80">Shown once.</div>
          </div>
        )}
        <ul className="divide-y divide-line">
          {lab.users.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center gap-3 py-3 ${u.isActive ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-body">{u.fullName} <span className="ms-1 rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-muted">{u.portal ?? u.role}</span></div>
                <div className="text-xs text-subtle">
                  <span className="font-mono">{u.username}</span> · last sign-in {u.lastLoginAt ?? 'never'}
                  {u.mustChangePassword && ' · must choose a password'}{!u.isActive && ' · switched off'}
                </div>
              </div>
              <button type="button" disabled={pending} className={btn} onClick={() => {
                if (!window.confirm(`${u.isActive ? 'Switch off' : 'Switch on'} ${u.username}?`)) return;
                run(() => setLabUserActiveAction(lab.id, u.id, !u.isActive));
              }}>{u.isActive ? 'Switch off' : 'Switch on'}</button>
              <button type="button" disabled={pending} className={`${btn} inline-flex items-center gap-1.5`} onClick={() => {
                if (!window.confirm(`Reset the password for ${u.username}? Their current password stops working.`)) return;
                setError(null);
                start(async () => {
                  const res = await resetLabUserPasswordAction(lab.id, u.id);
                  if (res.ok) { setReset({ username: res.username, password: res.password }); router.refresh(); } else setError(res.error);
                });
              }}><KeyRound className="h-4 w-4" /> Reset password</button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What happened in this lab" hint="The lab’s own audit trail: the last 50 changes its staff made.">
        {lab.audit.length === 0 ? <p className="text-sm text-muted">Nothing recorded yet.</p> : (
          <ul className="space-y-1.5 text-sm">
            {lab.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-subtle">{a.at}</span>
                <span className="font-semibold text-body">{a.action.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="text-muted">{a.entity}{a.who && ` · ${a.who}`}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Platform activity">
        {lab.events.length === 0 ? <p className="text-sm text-muted">No platform actions recorded for this lab.</p> : (
          <ul className="space-y-1.5 text-sm">
            {lab.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-subtle">{e.at}</span>
                <span className="font-semibold text-body">{EVENT[e.action] ?? e.action}</span>
                <span className="text-muted">by {e.admin}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Remove lab" danger>
        {lab.isActive ? (
          <p className="text-sm text-muted">Suspend the lab first. A lab can only be removed once nobody can use it.</p>
        ) : (
          <>
            <p className="text-sm text-muted">Permanently deletes every patient, booking, result, payment and user in this lab. There is no undo — export anything the lab needs first.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${lab.code} to confirm`} aria-label="Lab code to confirm" className="field min-w-48 flex-1 font-mono" />
              <button type="button" disabled={pending || typed.trim().toLowerCase() !== lab.code} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50" onClick={() => {
                if (!window.confirm(`Permanently remove ${lab.name}? This cannot be undone.`)) return;
                setError(null);
                start(async () => {
                  const res = await removeLabAction(lab.id, typed);
                  if (res.ok) router.push('/platform'); else setError(res.error);
                });
              }}><Trash2 className="h-4 w-4" /> Remove permanently</button>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` as a local date, and back — dates here are days, not instants. */
const localDay = (s: string) => new Date(`${s}T00:00:00`);
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** A month on from a day, less one: 1 Sept → 30 Sept, 15 Sept → 14 Oct. */
const monthOn = (s: string) => {
  const d = localDay(s);
  // Clamp to the next month's length, so 31 Jan runs to the end of February, not into March.
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), last) - 1));
};
const longDay = (s: string) => (s ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(localDay(s)) : '—');
