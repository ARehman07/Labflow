'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Plus, Stethoscope, Building2, ArrowDownLeft, ArrowUpRight, Check, Info } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { ACCENT, SectionHeading, RailGroup } from '@/components/ui/List';
import { cn, formatPkr } from '@/lib/utils';
import {
  getReferralAction,
  settleDoctorAction,
  createPartnerLabAction,
  type DoctorCommission,
  type PartnerLabRow,
} from '@/modules/referral/referral.actions';
import { Tr } from '@/components/ui/Tr';

/**
 * Two jobs live on this page and they were previously stacked with no
 * explanation: money owed to referring doctors, and the labs samples are
 * exchanged with. Each now says what it is for in a line, and the one control
 * that moves money asks before it does.
 */

export function ReferralClient({ canManage, canSettle }: { canManage: boolean; canSettle: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [doctors, setDoctors] = useState<DoctorCommission[]>([]);
  const [labs, setLabs] = useState<PartnerLabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getReferralAction()
      .then((r) => { setDoctors(r.doctors); setLabs(r.partnerLabs); })
      .catch(() => { setDoctors([]); setLabs([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  // A refund can reverse more commission than a doctor earned, so a doctor's
  // balance can legitimately be negative. That is not money owed.
  const totalOwed = doctors.reduce((s, d) => s + Math.max(0, d.accrued), 0);
  const owing = doctors.filter((d) => d.accrued > 0);

  return (
    <div className="page">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('referral.title')}</h1>
        <p className="mt-0.5 text-sm text-muted">{t('referral.subtitle')}</p>
      </div>

      {/* ── Doctor commission ─────────────────────────────────────── */}
      <section>
        <Card className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">
            {t('referral.totalOwed')}
          </div>
          <div className="mt-1 text-[36px] font-extrabold leading-none tracking-tight tabular-nums text-strong">
            {formatPkr(totalOwed)}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-subtle">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('referral.owedHint')}
          </p>

          <SectionHeading className="mt-5" accent={ACCENT.amber} count={owing.length}>
            {t('referral.owedTitle')}
          </SectionHeading>

          {loading ? (
            <p className="px-2 py-6 text-subtle">{t('common.loading')}</p>
          ) : doctors.length === 0 ? (
            <EmptyNote title={t('referral.noCommissions')} hint={t('referral.noCommissionsHint')} />
          ) : owing.length === 0 ? (
            <EmptyNote title={t('referral.allSettled')} ok />
          ) : (
            <RailGroup accent={ACCENT.amber}>
              <ul className="space-y-1">
                {owing.map((d) => (
                  <DoctorRow key={d.doctorId} doctor={d} canSettle={canSettle} onDone={load} toast={toast} />
                ))}
              </ul>
            </RailGroup>
          )}
        </Card>
      </section>

      {/* ── Partner labs ──────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-strong">{t('referral.partnerLabs')}</h2>
            <p className="text-xs text-subtle">{t('referral.partnerHint')}</p>
          </div>
          {canManage && !showAdd && (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> {t('referral.addPartner')}
            </Button>
          )}
        </div>

        {showAdd && (
          <AddPartnerForm onCancel={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />
        )}

        <Card className={cn('p-2', showAdd && 'mt-3')}>
          {labs.length === 0 ? (
            <p className="px-2 py-6 text-center text-subtle">{t('referral.noPartners')}</p>
          ) : (
            <ul className="space-y-0.5">
              {labs.map((l) => {
                const inward = l.direction === 'INWARD';
                return (
                  <li key={l.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        inward
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                          : 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
                      )}
                    >
                      {inward ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-body">{l.name}</span>
                      {/* The direction label carries its own meaning, so nobody
                          has to guess what "inward" is. */}
                      <span className="block truncate text-xs text-subtle">
                        {inward ? t('referral.inward') : t('referral.outward')}
                      </span>
                    </span>
                    {l.phone && (
                      <a
                        href={`tel:${l.phone}`}
                        className="shrink-0 font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {l.phone}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function DoctorRow({
  doctor, canSettle, onDone, toast,
}: {
  doctor: DoctorCommission;
  canSettle: boolean;
  onDone: () => void;
  toast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function settle() {
    startTransition(async () => {
      const res = await settleDoctorAction(doctor.doctorId, doctor.accrued);
      setConfirming(false);
      if (res.ok) {
        toast('success', t('referral.settled').replace('{amount}', formatPkr(res.settled)));
      } else {
        toast('error', res.error);
      }
      onDone();
    });
  }

  return (
    <li className="rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-subtle">
            <Stethoscope className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-body">{doctor.name}</span>
            <span className="block truncate text-xs text-subtle">
              {doctor.clinic ? `${doctor.clinic} · ` : ''}
              {doctor.commissionPct}% {t('referral.ofWhatPatientsPay')}
              {' · '}{doctor.visits} {t('referral.visitsSent')}
              {doctor.paid > 0 && ` · ${formatPkr(doctor.paid)} ${t('referral.alreadySettled')}`}
            </span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-end">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-subtle">
              {t('referral.youOwe')}
            </span>
            <span className="block text-base font-bold tabular-nums text-warn-text">
              {formatPkr(doctor.accrued)}
            </span>
          </span>
          {canSettle && !confirming && (
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
              {t('referral.settle')} {formatPkr(doctor.accrued)}
            </Button>
          )}
        </div>
      </div>

      {/* Handing over money is not an undoable click, so it asks first and
          names the doctor and the exact figure being settled. */}
      {confirming && (
        <div className="mt-2 rounded-xl bg-warn-soft p-3">
          <p className="text-sm font-semibold text-warn-text">
            {t('referral.settleConfirm')
              .replace('{name}', doctor.name)
              .replace('{amount}', formatPkr(doctor.accrued))}
          </p>
          <p className="mt-0.5 text-xs text-warn-text/80">{t('referral.settleConfirmHint')}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <Button size="sm" onClick={settle} loading={isPending}>
              <Check className="h-3.5 w-3.5" /> {t('referral.settleYes')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function EmptyNote({ title, hint, ok }: { title: string; hint?: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-5">
      {ok && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok-text">
          <Check className="h-4 w-4" />
        </span>
      )}
      <div>
        <p className="text-sm font-medium text-body">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function AddPartnerForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState('');
  const [direction, setDirection] = useState('INWARD');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createPartnerLabAction({ name, direction, phone });
      if (res.ok) { toast('success', t('referral.save')); onDone(); }
      else { setError(res.error ?? 'Failed'); toast('error', res.error ?? 'Failed'); }
    });
  }

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="pl-name">{t('referral.name')}</label>
          <input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} className="field" />
        </div>
        <div>
          <label className="label">{t('referral.direction')}</label>
          <Select value={direction} onChange={setDirection} options={[
            { value: 'INWARD', label: t('referral.inward') },
            { value: 'OUTWARD', label: t('referral.outward') },
          ]} />
        </div>
        <div>
          <label className="label" htmlFor="pl-phone">{t('referral.phone')}</label>
          <input id="pl-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" inputMode="tel" />
        </div>
      </div>
      {error && <p className="note-danger mt-3"><Tr text={error} /></p>}
      <div className="mt-4 flex items-center gap-2">
        <Button onClick={submit} loading={isPending} disabled={name.trim().length < 2}>{t('referral.save')}</Button>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </Card>
  );
}
