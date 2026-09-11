'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Phone, Check } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { ACCENT, SectionHeading, RailGroup } from '@/components/ui/List';
import { cn } from '@/lib/utils';
import {
  getCriticalCallbacksAction,
  recordCriticalCallbacksAction,
  type CriticalCallbackDTO,
} from '@/modules/lab/lab.actions';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Tr } from '@/components/ui/Tr';

const METHODS = ['Phone', 'WhatsApp', 'In person'] as const;

/**
 * Everything on this page is critical, so painting it all red says nothing —
 * the page title already carries that. Colour is spent on the one thing that
 * actually varies and actually escalates: how long the callback has gone
 * unmade. Red here means "this one is overdue", not "this one is abnormal".
 */
const WAIT_TONES = [
  { afterMins: 12 * 60, chip: 'bg-danger-soft text-danger-text' },
  { afterMins: 60, chip: 'bg-warn-soft text-warn-text' },
  { afterMins: 0, chip: 'bg-surface-3 text-muted' },
];
const waitTone = (mins: number) => WAIT_TONES.find((w) => mins >= w.afterMins)!;

const minsSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

/** How long the callback has been open, in plain words. */
function waitingFor(mins: number): string {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ${mins % 60} min`;
  return `${Math.floor(hrs / 24)} d ${hrs % 24} hr`;
}

/** One patient, every flagged value they have, and the single call that clears them. */
interface PatientGroup {
  key: string;
  patientName: string;
  mrNo: string;
  patientMobile: string | null;
  items: CriticalCallbackDTO[];
  /** The longest-waiting value decides how urgent the whole group is. */
  waitMins: number;
}

export function CriticalClient() {
  const { t } = useI18n();
  const [items, setItems] = useState<CriticalCallbackDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    getCriticalCallbacksAction()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  // The callback is a conversation with a clinician about a patient, not about
  // a number — so the page is organised the way the phone call actually goes.
  const groups = useMemo<PatientGroup[]>(() => {
    const by = new Map<string, PatientGroup>();
    for (const it of items) {
      const mins = minsSince(it.openedAt);
      const g = by.get(it.mrNo);
      if (g) {
        g.items.push(it);
        g.waitMins = Math.max(g.waitMins, mins);
      } else {
        by.set(it.mrNo, {
          key: it.mrNo,
          patientName: it.patientName,
          mrNo: it.mrNo,
          patientMobile: it.patientMobile,
          items: [it],
          waitMins: mins,
        });
      }
    }
    // Longest-waiting patient first: that is the one at risk.
    return [...by.values()].sort((a, b) => b.waitMins - a.waitMins);
  }, [items]);

  function submit(group: PatientGroup, form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await recordCriticalCallbacksAction(
        group.items.map((i) => i.id),
        {
          notifiedTo: String(data.get('notifiedTo') ?? ''),
          notifiedPhone: String(data.get('notifiedPhone') ?? '') || undefined,
          method: String(data.get('method') ?? 'Phone'),
          acknowledgedBy: String(data.get('acknowledgedBy') ?? '') || undefined,
          notes: String(data.get('notes') ?? '') || undefined,
        },
      );
      if (res.ok) {
        setOpenKey(null);
        load();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={t('critical.title')}
        subtitle={t('critical.intro')}
        back={{ href: '/lab', label: t('lab.title') }}
      />

      {error && <p className="note-danger"><Tr text={error} /></p>}

      {loading ? (
        <ListSkeleton rows={2} />
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/60 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ok-soft text-ok-text">
            <Check className="h-6 w-6" />
          </div>
          <p className="font-medium text-muted">{t('critical.none')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <PatientCallback
              key={g.key}
              group={g}
              open={openKey === g.key}
              onOpen={() => setOpenKey(g.key)}
              onCancel={() => setOpenKey(null)}
              onSubmit={submit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PatientCallback({
  group, open, onOpen, onCancel, onSubmit,
}: {
  group: PatientGroup;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: (g: PatientGroup, form: HTMLFormElement) => void;
}) {
  const { t } = useI18n();
  const tone = waitTone(group.waitMins);

  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-strong">{group.patientName}</h2>
          <div className="mt-0.5 text-xs text-subtle">MR# {group.mrNo}</div>
          {group.patientMobile && (
            // The number is the tool for this job, so it is a tap target, not a caption.
            <a
              href={`tel:${group.patientMobile}`}
              className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              <Phone className="h-3.5 w-3.5" />
              {group.patientMobile}
            </a>
          )}
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums', tone.chip)}>
          {t('critical.openFor')} {waitingFor(group.waitMins)}
        </span>
      </div>

      <SectionHeading className="mt-3.5" accent={ACCENT.rose} count={group.items.length}>
        {t('critical.flagged')}
      </SectionHeading>
      <RailGroup accent={ACCENT.rose}>
        <ul className="space-y-0.5">
          {group.items.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-body">{it.parameterName}</span>
                <span className="block truncate text-xs text-subtle">{it.testName}</span>
              </span>
              {/* The only red left on a row: the value that is actually out of range. */}
              <span className="shrink-0 text-sm font-bold tabular-nums text-danger-text">
                {it.value}
                {it.unit ? ` ${it.unit}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </RailGroup>

      {open ? (
        <form
          className="mt-3.5 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(group, e.currentTarget);
          }}
        >
          <label className="text-sm">
            <span className="label">{t('critical.notifiedTo')}</span>
            <input name="notifiedTo" required className="field" autoFocus />
          </label>
          <label className="text-sm">
            <span className="label">{t('critical.notifiedPhone')}</span>
            <input name="notifiedPhone" className="field" inputMode="tel" />
          </label>
          <label className="text-sm">
            <span className="label">{t('critical.method')}</span>
            <select name="method" className="field">
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">{t('critical.acknowledgedBy')}</span>
            <input name="acknowledgedBy" className="field" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="label">{t('critical.notes')}</span>
            <input name="notes" className="field" />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit">
              {group.items.length > 1
                ? t('critical.recordN').replace('{n}', String(group.items.length))
                : t('critical.record')}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
          </div>
        </form>
      ) : (
        <div className="mt-3.5">
          <Button onClick={onOpen}>
            <Phone className="h-4 w-4" />
            {group.items.length > 1
              ? t('critical.logCallN').replace('{n}', String(group.items.length))
              : t('critical.logCall')}
          </Button>
        </div>
      )}
    </article>
  );
}
