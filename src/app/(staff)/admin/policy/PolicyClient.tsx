'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Info, CreditCard, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { cn, formatPkr } from '@/lib/utils';
import { updateLabPolicyAction, type LabPolicy } from '@/modules/settings/settings.actions';

/**
 * The commercial dials for the whole lab. Every control shows what it does to a
 * real bill, because "15%" and "Rs 300" mean nothing until you see them land on
 * a slip — and getting these wrong is charging every patient the wrong amount.
 */
export function PolicyClient({ initial }: { initial: LabPolicy }) {
  const toast = useToast();
  const [p, setP] = useState<LabPolicy>(initial);
  const [saved, setSaved] = useState<LabPolicy>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(p) !== JSON.stringify(saved);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateLabPolicyAction({
        familyCardDiscountPct: p.familyCardDiscountPct,
        familyCardMemberCap: p.familyCardMemberCap,
        familyCardFee: p.familyCardFee,
        familyCardDiscountOnIssue: p.familyCardDiscountOnIssue,
        allowSelfVerify: p.allowSelfVerify,
      });
      if (res.ok) { setP(res.policy); setSaved(res.policy); toast('success', 'Lab policy updated'); }
      else { setError(res.error); toast('error', res.error); }
    });
  }

  // A worked example beats a field label. 1000 is the round number a lab owner
  // reaches for when checking "so what does a card actually save?".
  const sample = 1000;
  const discount = Math.round((sample * p.familyCardDiscountPct) / 100);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/admin"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-strong">Lab policy</h1>
          <p className="text-sm text-muted">
            Applies to every branch of {p.tenantName}. Staff use these rates; only you can change them.
          </p>
        </div>
      </div>

      <Card className="p-5">
        <SectionHeading accent={ACCENT.brand}>Family card</SectionHeading>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="Discount"
            hint="Off every test, for everyone on the card."
            suffix="%"
            value={p.familyCardDiscountPct}
            min={0}
            max={100}
            onChange={(v) => setP({ ...p, familyCardDiscountPct: v })}
          />
          <Field
            label="Joining fee"
            hint="Charged once, when the card is created. Never discounted."
            prefix="Rs"
            value={p.familyCardFee}
            min={0}
            onChange={(v) => setP({ ...p, familyCardFee: v })}
          />
          <Field
            label="People per card"
            hint="Including the card holder. Members can never be removed."
            value={p.familyCardMemberCap}
            min={1}
            max={50}
            step={1}
            onChange={(v) => setP({ ...p, familyCardMemberCap: Math.round(v) })}
          />
        </div>

        <Toggle
          className="mt-4"
          icon={CreditCard}
          label="Discount applies on the slip that creates the card"
          on={p.familyCardDiscountOnIssue}
          onChange={(v) => setP({ ...p, familyCardDiscountOnIssue: v })}
          onText="The patient saves today, which makes the card easy to sell at the counter."
          offText="The card is paid for today; the saving starts from the next visit."
        />

        {/* What the numbers above actually do to a bill. */}
        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">
            A {formatPkr(sample)} bill, on the day the card is bought
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <Line label="Tests" value={formatPkr(sample)} />
            <Line
              label={`Card discount (${p.familyCardDiscountPct}%)`}
              value={p.familyCardDiscountOnIssue ? `− ${formatPkr(discount)}` : formatPkr(0)}
              muted={!p.familyCardDiscountOnIssue}
            />
            <Line label="Joining fee" value={`+ ${formatPkr(p.familyCardFee)}`} />
            <div className="!mt-2 flex justify-between border-t border-dashed border-line pt-2 font-bold text-strong">
              <dt>Patient pays</dt>
              <dd className="tabular-nums">
                {formatPkr(sample - (p.familyCardDiscountOnIssue ? discount : 0) + p.familyCardFee)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-subtle">
            Every later visit: {formatPkr(sample)} becomes {formatPkr(sample - discount)}.
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading accent={ACCENT.amber}>Result safety</SectionHeading>
        <Toggle
          className="mt-3"
          icon={ShieldCheck}
          label="Allow the person who entered a result to approve it"
          on={p.allowSelfVerify}
          onChange={(v) => setP({ ...p, allowSelfVerify: v })}
          onText="Faster when one person covers a shift alone, but nobody checks their work."
          offText="A second pair of eyes must release every result. Recommended."
          danger={p.allowSelfVerify}
        />
      </Card>

      {error && <p className="note-danger">{error}</p>}

      <div className="sticky bottom-4 flex items-center gap-3">
        <Button onClick={save} loading={isPending} disabled={!dirty}>Save policy</Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setP(saved)}>Discard changes</Button>
        )}
        <span className="flex items-center gap-1.5 text-xs text-subtle">
          <Info className="h-3.5 w-3.5" />
          Changes apply to new bookings only. Existing cards and invoices keep their rates.
        </span>
      </div>
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between', muted ? 'text-subtle' : 'text-muted')}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Field({
  label, hint, value, onChange, prefix, suffix, min, max, step,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-sm font-semibold text-subtle">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step ?? 'any'}
          onChange={(e) => onChange(Math.max(min ?? 0, Number(e.target.value) || 0))}
          className={cn('field tabular-nums', prefix && 'ps-10', suffix && 'pe-8')}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3.5 text-sm font-semibold text-subtle">
            {suffix}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-subtle">{hint}</p>
    </div>
  );
}

function Toggle({
  icon: Icon, label, on, onChange, onText, offText, danger, className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; on: boolean; onChange: (v: boolean) => void;
  onText: string; offText: string; danger?: boolean; className?: string;
}) {
  return (
    <div className={cn('rounded-xl bg-surface-2 p-4', className)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            danger ? 'bg-warn-soft text-warn-text' : 'bg-surface-3 text-subtle',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-body">{label}</p>
          {/* The consequence of the current setting, not a generic description. */}
          <p className={cn('mt-0.5 text-xs', danger ? 'text-warn-text' : 'text-subtle')}>
            {on ? onText : offText}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={() => onChange(!on)}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            on ? 'bg-brand-500' : 'bg-surface-3 ring-1 ring-inset ring-line',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
              on ? 'start-[22px]' : 'start-0.5',
            )}
          />
        </button>
      </div>
    </div>
  );
}
