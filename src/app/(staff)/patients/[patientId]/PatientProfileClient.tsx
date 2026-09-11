'use client';

import Link from 'next/link';
import { CreditCard, FilePlus2, FileText, Phone, Receipt, ScrollText } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn, formatPkr } from '@/lib/utils';
import type { PatientProfileDTO, PatientVisitDTO } from '@/modules/patients/patients.actions';

/** Test statuses folded into the four stages staff already know from the Lab board. */
const STAGE: Record<string, { labelKey: string; dot: string }> = {
  BOOKED: { labelKey: 'lab.filterCollect', dot: 'bg-slate-400' },
  RETAKE: { labelKey: 'lab.filterProgress', dot: 'bg-amber-500' },
  SAMPLE_COLLECTED: { labelKey: 'lab.filterProgress', dot: 'bg-amber-500' },
  SAMPLE_DISPATCHED: { labelKey: 'lab.filterProgress', dot: 'bg-amber-500' },
  SAMPLE_RECEIVED: { labelKey: 'lab.filterProgress', dot: 'bg-amber-500' },
  IN_PROGRESS: { labelKey: 'lab.filterProgress', dot: 'bg-amber-500' },
  RESULT_SAVED: { labelKey: 'lab.filterApproval', dot: 'bg-violet-500' },
  APPROVED: { labelKey: 'lab.filterReady', dot: 'bg-emerald-500' },
  PRINTED: { labelKey: 'lab.filterReady', dot: 'bg-emerald-500' },
  DELIVERED: { labelKey: 'lab.filterReady', dot: 'bg-emerald-500' },
  CANCELLED: { labelKey: 'lab.filterReady', dot: 'bg-line-strong' },
};

const fmtDate = (iso: string, withTime = false) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso));

/**
 * One patient: who they are, what they owe, and every visit with its tests,
 * slip, report and invoice a click away.
 */
export function PatientProfileClient({ profile: p }: { profile: PatientProfileDTO }) {
  const { t } = useI18n();

  return (
    <div className="page">
      <PageHeader
        icon={
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-base font-bold text-white">
            {p.fullName.slice(0, 1).toUpperCase()}
          </span>
        }
        title={p.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono">{p.mrNo}</span>
            {p.age != null && <span>· {p.age} {t('common.years')}</span>}
            {p.sex && <span>· {t(`reception.${p.sex.toLowerCase()}`)}</span>}
            {p.mobile && (
              <a href={`tel:${p.mobile}`} className="inline-flex items-center gap-1 font-mono text-brand-600 hover:underline dark:text-brand-300">
                · <Phone className="h-3.5 w-3.5" /> {p.mobile}
              </a>
            )}
          </span>
        }
        actions={p.can.book ? (
          <Link href={`/reception?patient=${p.id}`} className={buttonVariants()}>
            <FilePlus2 className="h-4 w-4" /> {t('nav.newBooking')}
          </Link>
        ) : undefined}
      />

      {/* The three questions reception asks first. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('patient.visits')} value={String(p.totals.visits)} hint={t('patient.since').replace('{date}', fmtDate(p.since))} />
        {p.can.billing && <Stat label={t('patient.billed')} value={formatPkr(p.totals.billed)} />}
        {p.can.billing && (
          <Stat
            label={t('patient.outstanding')}
            value={formatPkr(p.totals.outstanding)}
            tone={p.totals.outstanding > 0 ? 'warn' : 'ok'}
          />
        )}
      </div>

      {p.card && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ok-soft text-ok-text">
            <CreditCard className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-strong">
              {(p.card.holder ? t('patient.cardHolder') : t('patient.cardMember')).replace('{pct}', String(p.card.discountPct))}
            </span>
            <span className="block font-mono text-xs text-muted">{p.card.mobile}</span>
          </span>
          {!p.card.isActive && <Badge tone="neutral">{t('familyCard.inactive')}</Badge>}
        </Card>
      )}

      {p.address && <p className="text-sm text-muted">{p.address}</p>}

      <section>
        <h2 className="section-title mb-2">{t('patient.history')}</h2>
        {p.visits.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle">
              <ScrollText className="h-6 w-6" />
            </span>
            <p className="text-muted">{t('patient.noVisits')}</p>
          </Card>
        ) : (
          <ul className="stagger space-y-3">
            {p.visits.map((v) => (
              <li key={v.id}><VisitCard v={v} can={p.can} /></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' | 'ok' }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-extrabold tabular-nums',
        tone === 'warn' ? 'text-warn-text' : 'text-strong')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </Card>
  );
}

function VisitCard({ v, can }: { v: PatientVisitDTO; can: PatientProfileDTO['can'] }) {
  const { t } = useI18n();
  const due = v.invoice ? Math.max(0, v.invoice.net - v.invoice.paid) : 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <div className="font-semibold text-strong">{fmtDate(v.bookedAt, true)}</div>
          <div className="text-xs text-muted">
            <span className="font-mono">#{v.slipNo}</span>
            {v.doctor && <> · {t('patient.referredBy').replace('{name}', v.doctor)}</>}
          </div>
        </div>
        {v.invoice && can.billing && (
          due > 0
            ? <Badge tone="warning">{t('patient.due').replace('{amount}', formatPkr(due))}</Badge>
            : <Badge tone="success">{t('patient.paid')} · {formatPkr(v.invoice.net)}</Badge>
        )}
      </div>

      <ul className="flex flex-wrap gap-1.5 px-4 pt-3">
        {v.tests.map((tst, i) => {
          const st = STAGE[tst.status] ?? STAGE.BOOKED;
          return (
            <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs ring-1 ring-line">
              <span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} aria-hidden />
              <span className="font-medium text-body">{tst.name}</span>
              <span className="text-subtle">· {t(st.labelKey)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/50 px-4 py-2.5">
        <Link href={`/reception/${v.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ScrollText className="h-4 w-4" /> {t('patient.slip')}
        </Link>
        {v.invoice && can.billing && (
          <Link href={`/billing?invoice=${v.invoice.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            <Receipt className="h-4 w-4" /> {t('patient.invoice')}
          </Link>
        )}
        {v.reportReady && can.report && (
          <Link href={`/lab/report/${v.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <FileText className="h-4 w-4" /> {t('patient.report')}
          </Link>
        )}
      </div>
    </Card>
  );
}
