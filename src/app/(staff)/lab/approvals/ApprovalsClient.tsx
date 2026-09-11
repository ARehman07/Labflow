'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCheck, CircleCheck, FilePenLine, Lock, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonVariants } from '@/components/ui/Button';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { FlagBadge } from '@/components/ui/FlagBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  getApprovalsAction, approveAction, approveManyAction, sendBackAction, type ApprovalDTO,
} from '@/modules/lab/lab.actions';

const ok = (it: ApprovalDTO) => it.missingCalculated.length === 0 && !it.selfBlocked;
const allNormal = (it: ApprovalDTO) => ok(it) && it.abnormal === 0 && it.critical === 0;

/**
 * The last check before a result reaches a patient.
 *
 * Each result is shown with its values, flags and reference ranges right here.
 * The old list showed a test name and a warning count, so every approval meant
 * opening the result, reading it, and coming back — which is exactly how a
 * busy approver ends up approving without reading.
 *
 * Anything that would make approval fail — a blank calculated value, or the
 * approver's own entry where self-approval is off — is said up front, on the
 * card, instead of as an error after pressing the button.
 */
export function ApprovalsClient() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<ApprovalDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getApprovalsAction()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const normal = items.filter(allNormal);
  const needsLook = items.length - normal.length;

  async function approve(it: ApprovalDTO) {
    setBusy(`${it.orderLineId}:approve`);
    const res = await approveAction(it.orderLineId);
    setBusy(null);
    if (res.ok) {
      setItems((xs) => xs.filter((x) => x.orderLineId !== it.orderLineId));
      toast('success', `${it.testName} · ${t('approvals.approved')}`);
    } else toast('error', res.error);
  }

  async function sendBack(it: ApprovalDTO) {
    setBusy(`${it.orderLineId}:back`);
    const res = await sendBackAction(it.orderLineId);
    setBusy(null);
    if (res.ok) {
      setItems((xs) => xs.filter((x) => x.orderLineId !== it.orderLineId));
      toast('info', `${it.testName} · ${t('approvals.sentBack')}`);
    } else toast('error', res.error);
  }

  async function approveAllNormal() {
    setBusy('all');
    const res = await approveManyAction(normal.map((n) => n.orderLineId));
    setBusy(null);
    toast(res.failed.length ? 'error' : 'success',
      t('approvals.approveAllDone').replace('{n}', String(res.approved))
      + (res.failed.length ? ` · ${res.failed[0].error}` : ''));
    load();
  }

  return (
    <div className="page">
      <PageHeader
        title={t('approvals.title')}
        subtitle={t('approvals.subtitle')}
        back={{ href: '/lab', label: t('lab.title') }}
      />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ok-soft text-ok-text">
            <CircleCheck className="h-7 w-7" />
          </span>
          <p className="font-semibold text-strong">{t('approvals.none')}</p>
          <Link href="/lab" className={buttonVariants({ variant: 'outline' })}>{t('lab.title')}</Link>
        </div>
      ) : (
        <>
          {/* What is waiting, and the one bulk action that is safe to take. */}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="font-semibold text-strong tabular-nums">
                {t('approvals.waitingN').replace('{n}', String(items.length))}
              </span>
              <span className="flex items-center gap-1.5 text-ok-text tabular-nums">
                <CircleCheck className="h-4 w-4" /> {t('approvals.normalN').replace('{n}', String(normal.length))}
              </span>
              {needsLook > 0 && (
                <span className="flex items-center gap-1.5 text-warn-text tabular-nums">
                  <TriangleAlert className="h-4 w-4" /> {t('approvals.lookN').replace('{n}', String(needsLook))}
                </span>
              )}
            </div>
            {normal.length > 0 && (
              <ConfirmButton
                variant="primary"
                size="md"
                tone="primary"
                loading={busy === 'all'}
                disabled={busy !== null}
                prompt={t('approvals.approveAllPrompt').replace('{n}', String(normal.length))}
                confirmLabel={t('approvals.approve')}
                onConfirm={approveAllNormal}
              >
                <CheckCheck className="h-4 w-4" />
                {t('approvals.approveAllNormal').replace('{n}', String(normal.length))}
              </ConfirmButton>
            )}
          </div>

          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.orderLineId}>
                <ApprovalCard
                  it={it}
                  busy={busy}
                  onApprove={() => approve(it)}
                  onSendBack={() => sendBack(it)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ApprovalCard({
  it, busy, onApprove, onSendBack,
}: { it: ApprovalDTO; busy: string | null; onApprove: () => void; onSendBack: () => void }) {
  const { t } = useI18n();
  const blockedReason = it.missingCalculated.length > 0
    ? t('approvals.missingCalc').replace('{names}', it.missingCalculated.join(', '))
    : it.selfBlocked ? t('approvals.selfEntered') : null;

  return (
    <article className={cn('card overflow-hidden', it.critical > 0 && 'ring-1 ring-danger-line')}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-strong">{it.testName}</h2>
          <p className="truncate text-sm text-muted">
            {it.patientName} · {it.mrNo}
            {it.age != null && ` · ${it.age} ${t('common.years')}`}
            {it.sex && ` · ${t(`reception.${it.sex.toLowerCase()}`)}`}
            <span className="font-mono text-xs text-subtle"> · #{it.slipNo}</span>
          </p>
          {it.enteredBy && (
            <p className="mt-0.5 text-xs text-subtle">
              {t('approvals.enteredBy')}: {it.enteredBy} · {new Date(it.savedAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {it.critical > 0 && (
            <Badge tone="danger">{t('approvals.criticalN').replace('{n}', String(it.critical))}</Badge>
          )}
          {it.abnormal > 0 && (
            <Badge tone="warning">{t('approvals.abnormalN').replace('{n}', String(it.abnormal))}</Badge>
          )}
          {it.abnormal === 0 && it.critical === 0 && <Badge tone="success">{t('approvals.normal')}</Badge>}
        </div>
      </div>

      {/* A culture has no parameter values; its result is one line to check. */}
      {it.culture && (
        <p className="mt-3 px-4 text-sm">
          <span className="font-semibold text-muted">{t('culture.result')}:</span>{' '}
          <span className="font-bold text-strong">{it.culture === 'No growth' ? t('culture.noGrowth') : it.culture}</span>
        </p>
      )}

      {/* The values themselves — the thing being approved. A table from tablet
          width up; on a phone each value is its own row, because five columns
          in 390px either overlap or scroll sideways. */}
      <div className="mt-3 px-4">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_auto_4.5rem_minmax(0,1.6fr)_5.5rem] gap-x-3 border-b border-line pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle sm:grid">
          <span>{t('result.parameter')}</span>
          <span className="text-end">{t('result.result')}</span>
          <span>{t('result.unit')}</span>
          <span>{t('result.reference')}</span>
          <span className="sr-only">{t('result.flag')}</span>
        </div>
        <ul>
          {it.values.map((v) => {
            const blank = v.value == null || v.value.trim() === '';
            const out = v.flag === 'HIGH' || v.flag === 'LOW' || v.flag === 'CRITICAL';
            const valueTone = blank
              ? (v.calculated ? 'text-danger-text' : 'text-subtle')
              : v.flag === 'CRITICAL' ? 'text-danger-text' : out ? 'text-warn-text' : 'text-strong';
            return (
              <li
                key={v.name}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-b border-line/60 py-2 last:border-0 sm:grid-cols-[minmax(0,1.4fr)_auto_4.5rem_minmax(0,1.6fr)_5.5rem]"
              >
                <span className={cn('min-w-0 text-sm text-body', v.bold && 'font-semibold')}>
                  {v.name}
                  {v.calculated && <span className="ms-1.5 text-[10px] font-semibold uppercase text-subtle">{t('approvals.calc')}</span>}
                </span>
                <span className={cn('text-end text-sm font-semibold tabular-nums', valueTone)}>
                  {blank ? '—' : v.value}
                  <span className="ms-1 text-xs font-normal text-muted sm:hidden">{v.unit ?? ''}</span>
                </span>
                <span className="hidden text-sm text-muted sm:block">{v.unit ?? ''}</span>
                <span className="col-span-2 text-xs text-muted sm:col-span-1">{v.reference ?? ''}</span>
                <span className="col-span-2 sm:col-span-1 sm:text-end">
                  {!blank && out && <FlagBadge flag={v.flag} size="sm" />}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {blockedReason && (
        <p className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-text">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" /> {blockedReason}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-4 py-3">
        <Link href={`/lab/result/${it.orderLineId}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <FilePenLine className="h-4 w-4" /> {t('approvals.edit')}
        </Link>
        <Button variant="outline" size="sm" onClick={onSendBack}
          loading={busy === `${it.orderLineId}:back`} disabled={busy !== null && busy !== `${it.orderLineId}:back`}>
          <Undo2 className="h-4 w-4 rtl:-scale-x-100" /> {t('approvals.sendBack')}
        </Button>
        <Button variant="success" size="sm" onClick={onApprove}
          loading={busy === `${it.orderLineId}:approve`}
          disabled={!!blockedReason || (busy !== null && busy !== `${it.orderLineId}:approve`)}
          title={blockedReason ?? undefined}>
          <ShieldCheck className="h-4 w-4" /> {t('approvals.approve')}
        </Button>
      </div>
    </article>
  );
}
