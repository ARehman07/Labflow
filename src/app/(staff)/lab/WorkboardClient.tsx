'use client';

import { useFeatures } from '@/core/features/FeaturesProvider';import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search, Droplet, PencilLine, Eye, Printer, PackageCheck, AlertTriangle, Clock, Megaphone, MessageSquareText, RotateCcw, Send, SlidersHorizontal, Ticket, Undo2, X, type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Select } from '@/components/ui/Select';
import { listOutwardPartnersAction } from '@/modules/partners/partners.actions';
import { getQueueAction, callNextAction, type QueueTokenRow } from '@/modules/queue/queue.actions';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { ACCENT, SectionHeading, HeadingAction, RailGroup, RowList, Row, type Accent } from '@/components/ui/List';
import { cn } from '@/lib/utils';
import {
  getWorkboardAction,
  advanceAction,
  advanceManyAction,
  undoCollectAction,
  requestRetakeAction,
  markDelayedAction,
  sendOutAction,
  getBoardFilterOptionsAction,
  type BoardFilters,
  type WorkVisitDTO,
  type WorkLineDTO,
} from '@/modules/lab/lab.actions';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag } from 'lucide-react';

/**
 * One card per patient, all of their tests inside it.
 *
 * The card IS the draw list: a phlebotomist walks to the chair once, so every
 * tube that patient needs has to be visible in one place. A flat queue reads
 * better as a to-do list and is the wrong shape for the physical job.
 *
 * Inside a card the tests are GROUPED BY STAGE, and the group headings are the
 * same four words as the filter chips above. Stage is carried by a heading you
 * can read, not by a colour you have to memorise — the eleven raw statuses stay
 * as small print on the row, where they say which button you get.
 */

type StageKey = 'COLLECT' | 'PROGRESS' | 'APPROVAL' | 'READY' | 'OTHER';
type FilterKey = 'ALL' | Exclude<StageKey, 'OTHER'>;

interface Stage {
  key: StageKey;
  labelKey: string;
  statuses: string[];
  /** Shared tint: the dot on the filter chip, the dot on the group heading and
   *  the rail beside the rows are all this one accent, which is what teaches
   *  the colour without a separate legend. */
  accent: Accent;
}

const STAGES: Stage[] = [
  {
    key: 'COLLECT', labelKey: 'lab.filterCollect', statuses: ['BOOKED'],
    accent: ACCENT.neutral,
  },
  {
    key: 'PROGRESS', labelKey: 'lab.filterProgress',
    statuses: ['SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RETAKE'],
    accent: ACCENT.amber,
  },
  {
    key: 'APPROVAL', labelKey: 'lab.filterApproval', statuses: ['RESULT_SAVED'],
    accent: ACCENT.violet,
  },
  {
    key: 'READY', labelKey: 'lab.filterReady', statuses: ['APPROVED', 'PRINTED', 'DELIVERED'],
    accent: ACCENT.emerald,
  },
  // Not a filter chip. Catches CANCELLED and anything new, so a test can never
  // silently vanish from its patient's card.
  {
    key: 'OTHER', labelKey: 'lab.filterOther', statuses: [],
    accent: ACCENT.neutral,
  },
];

const FILTER_STAGES = STAGES.filter((s) => s.key !== 'OTHER');
const STAGE_BY_STATUS = new Map<string, Stage>(
  STAGES.flatMap((s) => s.statuses.map((st) => [st, s] as const)),
);
const OTHER_STAGE = STAGES[STAGES.length - 1];
const stageOf = (status: string) => STAGE_BY_STATUS.get(status) ?? OTHER_STAGE;

const READY = new Set(['APPROVED', 'PRINTED', 'DELIVERED']);


const isOverdue = (l: WorkLineDTO) =>
  !READY.has(l.status) && l.dueAt != null && new Date(l.dueAt).getTime() < Date.now();

/** "40m" / "3h" / "2d" — how late, so the row says something more useful than
 *  a red OVERDUE stamp that ends up on every line at once. */
function lateBy(dueAt: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(dueAt).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function WorkboardClient() {
  const { t } = useI18n();
  const [visits, setVisits] = useState<WorkVisitDTO[]>([]);
  const toast = useToast();
  // The dashboard links straight to a stage, so a technician lands on the
  // list they clicked rather than on everything. A scan in the top search
  // arrives as ?q=, already narrowed to that slip.
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const initial = params.get('stage');
  const [filter, setFilter] = useState<FilterKey>(
    initial && FILTER_STAGES.some((s) => s.key === initial) ? (initial as FilterKey) : 'ALL',
  );
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  // Narrowing the board: a date range beyond the usual 30 days, a department,
  // one test status, or one partner lab's patients.
  const [filters, setFilters] = useState<BoardFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [options, setOptions] = useState<{ departments: { id: string; name: string }[]; partners: { id: string; name: string }[] }>({ departments: [], partners: [] });
  const filtersRef = useRef<BoardFilters>(filters);
  filtersRef.current = filters;
  const activeFilters = Object.values(filters).filter(Boolean).length;
  useEffect(() => {
    if (filtersOpen && options.departments.length === 0) getBoardFilterOptionsAction().then(setOptions).catch(() => {});
  }, [filtersOpen, options.departments.length]);

  const load = useCallback((q?: string) => {
    setLoading(true);
    getWorkboardAction(q, filtersRef.current).then(setVisits).catch(() => setVisits([])).finally(() => setLoading(false));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(query || undefined); }, [filters]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(query || undefined), [load]);

  // The waiting room, from the bench. Whoever draws the blood is the one who
  // calls the next patient in, and walking to the Queue screen to do it meant
  // leaving the list they work from.
  const [queue, setQueue] = useState<{ tokens: QueueTokenRow[]; nowServing: number | null } | null>(null);
  const [calling, setCalling] = useState(false);
  const loadQueue = useCallback(() => {
    getQueueAction().then((r) => setQueue({ tokens: r.tokens, nowServing: r.nowServing })).catch(() => setQueue(null));
  }, []);
  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 15000);
    return () => clearInterval(id);
  }, [loadQueue]);

  function callNext() {
    if (calling) return;
    setCalling(true);
    callNextAction()
      .then((r) => { if (!r.ok) toast('error', t('lab.callFailed')); })
      .catch(() => toast('error', t('lab.callFailed')))
      .finally(() => { setCalling(false); loadQueue(); load(query || undefined); });
  }
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(query || undefined), 300);
    return () => clearTimeout(debounce.current);
  }, [query, load]);

  function advance(orderLineId: string, to: string) {
    if (to === '__reload__') { load(query || undefined); return; }
    startTransition(async () => {
      const res = await advanceAction({ orderLineId, to });
      if (res.ok) { load(query || undefined); loadQueue(); }
      else toast('error', res.error);
    });
  }

  function collectAll(ids: string[]) {
    startTransition(async () => {
      const res = await advanceManyAction(ids, 'SAMPLE_COLLECTED');
      if (res.ok) { load(query || undefined); loadQueue(); }
      else toast('error', res.error);
    });
  }

  function undoCollect(orderLineId: string) {
    startTransition(async () => {
      const res = await undoCollectAction(orderLineId);
      if (res.ok) { toast('success', t('lab.undone')); load(query || undefined); loadQueue(); }
      else toast('error', res.error);
    });
  }

  async function retake(orderLineId: string, reason: string) {
    const res = await requestRetakeAction(orderLineId, reason);
    if (res.ok) { toast('success', t('lab.retakeDone')); load(query || undefined); loadQueue(); }
    else toast('error', res.error);
    return res.ok;
  }

  async function delay(orderLineId: string, reason: string) {
    const res = await markDelayedAction(orderLineId, reason);
    if (res.ok) { toast('success', t('lab.delayDone')); load(query || undefined); }
    else toast('error', res.error);
    return res.ok;
  }

  const waitingTokens = queue?.tokens.filter((tk) => tk.status === 'WAITING').length ?? 0;
  const nextToken = queue?.tokens.find((tk) => tk.status === 'WAITING') ?? null;
  const serving = queue?.nowServing != null
    ? queue.tokens.find((tk) => tk.status === 'CALLED' && tk.number === queue.nowServing) ?? null
    : null;

  // Two numbers per stage, because they answer different questions. Patients
  // is how many people are waiting; tests is how much work that is. A single
  // count of tests read as "2 patients to collect" when it was one patient
  // with two tubes — exactly the confusion staff reported.
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { ALL: 0, COLLECT: 0, PROGRESS: 0, APPROVAL: 0, READY: 0 };
    const people: Record<FilterKey, number> = { ALL: 0, COLLECT: 0, PROGRESS: 0, APPROVAL: 0, READY: 0 };
    for (const v of visits) {
      const seen = new Set<string>();
      for (const l of v.lines) {
        c.ALL += 1;
        const st = stageOf(l.status);
        if (st.key !== 'OTHER') {
          c[st.key as Exclude<StageKey, 'OTHER'>] += 1;
          seen.add(st.key);
        }
      }
      people.ALL += 1;
      for (const k of seen) people[k as Exclude<StageKey, 'OTHER'>] += 1;
    }
    return { tests: c, patients: people };
  }, [visits]);

  // Whole patient cards are kept; filtering picks which cards to show, never
  // which tests inside them. Cards needing attention float up: overdue first,
  // then still-active, then finished.
  const shown = useMemo(() => {
    const list = filter === 'ALL'
      ? visits.slice()
      : visits.filter((v) => v.lines.some((l) => stageOf(l.status).key === filter));
    // The patient just called in comes first: they are walking to the chair.
    const rank = (v: WorkVisitDTO) =>
      v.token?.status === 'CALLED' ? -1
        : v.lines.some(isOverdue) ? 0 : v.lines.some((l) => !READY.has(l.status)) ? 1 : 2;
    return list.sort((a, b) => rank(a) - rank(b) || a.patientName.localeCompare(b.patientName));
  }, [visits, filter]);

  // Masonry: each card drops into whichever column is shorter so far, so a tall
  // card never leaves a hole beside a short one, and the most urgent patients
  // still sit at the top of both columns.
  const columnCount = useColumnCount();
  const columns = useMemo(() => {
    const cols: WorkVisitDTO[][] = Array.from({ length: columnCount }, () => []);
    const heights = new Array<number>(columnCount).fill(0);
    for (const v of shown) {
      const i = heights.indexOf(Math.min(...heights));
      cols[i].push(v);
      heights[i] += estimateCardHeight(v);
    }
    return cols;
  }, [shown, columnCount]);

  return (
    <div className="page">
      <PageHeader
        title={t('lab.title')}
        actions={
          <>
            {queue && (serving || waitingTokens > 0) && (
              // The waiting room sits beside the title: calling the next patient in
              // is the first thing done at the bench, before any card is touched.
              <div className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface p-1.5 shadow-card sm:w-auto">
                <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-brand-600 px-2 font-mono text-lg font-black tabular-nums text-white">
                  {serving ? serving.number : '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-subtle">{t('lab.nowServing')}</div>
                  <div className="truncate text-sm font-semibold text-strong sm:max-w-52">
                    {serving ? serving.patientName : t('lab.nobodyCalled')}
                    <span className="font-normal text-muted">
                      {' · '}
                      {nextToken && `${t('lab.upNext').replace('{n}', String(nextToken.number))} · `}
                      {t('lab.waitingN').replace('{n}', String(waitingTokens))}
                    </span>
                  </div>
                </div>
                <Button size="sm" className="shrink-0" onClick={callNext} loading={calling} disabled={waitingTokens === 0}>
                  <Megaphone className="h-4 w-4" /> {t('lab.callNext')}
                </Button>
              </div>
)}
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('lab.search')} aria-label={t('lab.search')} className="field ps-10" />
            </div>
          </>
        }
      />

      {/* One sticky bar for narrowing the work: which stage, and any extra filters.
          It stays put while the cards scroll, so switching stage never means
          scrolling back to the top. */}
      <div className="sticky top-[66px] z-10 -mx-2 flex flex-wrap items-center gap-2 bg-canvas/90 px-2 py-2 backdrop-blur-md">
        {/* Phones swipe the chips sideways; a wrapped stack would fill the screen once it sticks. */}
        <div className="-my-1 flex min-w-0 flex-1 gap-2 no-scrollbar overflow-x-auto py-1 sm:flex-wrap sm:overflow-visible">
          <FilterChip
            label={t('lab.filterAll')} patients={counts.patients.ALL} tests={counts.tests.ALL}
            active={filter === 'ALL'} onClick={() => setFilter('ALL')}
          />
          {FILTER_STAGES.map((st) => (
            <FilterChip
              key={st.key} label={t(st.labelKey)}
              patients={counts.patients[st.key as Exclude<StageKey, 'OTHER'>]}
              tests={counts.tests[st.key as Exclude<StageKey, 'OTHER'>]}
              dot={st.accent.dot} active={filter === st.key} onClick={() => setFilter(st.key as FilterKey)}
            />
          ))}
        </div>
        <div className="ms-auto shrink-0">
          <Button variant={activeFilters > 0 ? 'primary' : 'outline'} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-label={t('lab.filters')} title={t('lab.filters')}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">{t('lab.filters')}</span>
            {activeFilters > 0 && ` (${activeFilters})`}
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="bf-from">{t('lab.filterFrom')}</label>
            <input id="bf-from" type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="bf-to">{t('lab.filterTo')}</label>
            <input id="bf-to" type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))} className="field" />
          </div>
          <div>
            <span className="label">{t('lab.filterDepartment')}</span>
            <Select
              value={filters.departmentId ?? ''}
              onChange={(v) => setFilters((f) => ({ ...f, departmentId: v || undefined }))}
              options={[{ value: '', label: t('lab.anyDepartment') }, ...options.departments.map((d) => ({ value: d.id, label: d.name }))]}
            />
          </div>
          <div>
            <span className="label">{t('lab.filterStatus')}</span>
            <Select
              value={filters.testStatus ?? ''}
              onChange={(v) => setFilters((f) => ({ ...f, testStatus: v || undefined }))}
              options={[{ value: '', label: t('lab.anyStatus') }, ...['BOOKED', 'SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RESULT_SAVED', 'APPROVED', 'PRINTED', 'DELIVERED', 'RETAKE'].map((st) => ({ value: st, label: t(`status.${st}`) }))]}
            />
          </div>
          <div>
            <span className="label">{t('lab.filterPartner')}</span>
            <Select
              value={filters.partnerLabId ?? ''}
              onChange={(v) => setFilters((f) => ({ ...f, partnerLabId: v || undefined }))}
              options={[
                { value: '', label: t('lab.anyPatients') },
                { value: 'NONE', label: t('lab.walkInsOnly') },
                { value: 'ANY', label: t('lab.anyPartner') },
                ...options.partners.map((x) => ({ value: x.id, label: x.name })),
              ]}
            />
          </div>
          {activeFilters > 0 && (
            <div className="sm:col-span-2 lg:col-span-5">
              <Button variant="ghost" size="sm" onClick={() => setFilters({})}><X className="h-3.5 w-3.5" /> {t('lab.clearFilters')}</Button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <WorkboardSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState label={filter === 'ALL' ? t('lab.noVisits') : t('lab.allClear')} />
      ) : (
        <div className="stagger flex items-start gap-4">
          {columns.map((col, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
              {col.map((v) => (
                <PatientCard key={v.id} visit={v} onAdvance={advance} onCollectAll={collectAll} onUndo={undoCollect} onRetake={retake} onDelay={delay} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Two columns from the md breakpoint up, matching the skeleton. */
function useColumnCount() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setN(mq.matches ? 2 : 1);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return n;
}

/** Rough pixel height of a card — only has to rank columns, not be exact. */
function estimateCardHeight(v: WorkVisitDTO): number {
  const stages = new Set(v.lines.map((l) => stageOf(l.status).key)).size;
  const lineExtras = v.lines.reduce((h, l) => h
    + (l.bookingRemarks ? 18 : 0) + (l.delayReason ? 18 : 0) + (l.outsourcedTo ? 18 : 0)
    + (isOverdue(l) || RETAKEABLE.has(l.status) ? 22 : 0), 0);
  return 90 + (v.notes ? 20 + Math.ceil(v.notes.length / 60) * 18 : 0)
    + stages * 40 + v.lines.length * 48 + lineExtras;
}

function FilterChip({
  label, patients, tests, dot, active, onClick,
}: { label: string; patients: number; tests: number; dot?: string; active: boolean; onClick: () => void }) {
  const { t } = useI18n();
  const patientsText = patients === 1 ? t('lab.onePatient') : t('lab.patientsN').replace('{n}', String(patients));
  const testsText = tests === 1 ? t('lab.oneTest') : t('lab.testsN').replace('{n}', String(tests));
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={`${patientsText} · ${testsText}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all',
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-line bg-surface text-muted hover:border-brand-300 hover:text-brand-600',
      )}
    >
      {dot && <span className={cn('h-2 w-2 rounded-full', active ? 'bg-white/80' : dot)} />}
      {label}
      <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/20' : 'bg-surface-3 text-body')}>
        {patients}
      </span>
      {tests !== patients && (
        <span className={cn('text-xs font-medium tabular-nums', active ? 'text-white/80' : 'text-subtle')}>
          · {testsText}
        </span>
      )}
    </button>
  );
}

function PatientCard({
  visit, onAdvance, onCollectAll, onUndo, onRetake, onDelay,
}: {
  visit: WorkVisitDTO;
  onAdvance: (id: string, to: string) => void;
  onCollectAll: (ids: string[]) => void;
  onUndo: (id: string) => void;
  onRetake: ReasonHandler;
  onDelay: ReasonHandler;
}) {
  const { t } = useI18n();
  const overdueCount = visit.lines.filter(isOverdue).length;

  // Tests bucketed by stage, in workflow order, empty buckets dropped.
  const groups = useMemo(
    () => STAGES
      .map((s) => ({ stage: s, lines: visit.lines.filter((l) => stageOf(l.status).key === s.key) }))
      .filter((g) => g.lines.length > 0),
    [visit.lines],
  );

  return (
    <article
      aria-labelledby={`patient-${visit.id}`}
      className={cn('card card-hover space-y-4 p-4', visit.token?.status === 'CALLED' && 'ring-2 ring-brand-500')}
    >
      {/* Header — who this is, and how much work, in one plain line. No rule
          underneath it; the gap does that job more quietly. */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
          {visit.patientName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id={`patient-${visit.id}`} className="truncate font-semibold text-strong">{visit.patientName}</h2>
            <span className="flex shrink-0 items-center gap-2">
              {visit.token && (
                <span
                  title={t('queue.token')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                    visit.token.status === 'CALLED' ? 'bg-brand-600 text-white' : 'bg-surface-3 text-body',
                  )}
                >
                  <Ticket className="h-3 w-3" />
                  {visit.token.status === 'CALLED' && <span>{t('lab.calling')}</span>}
                  {visit.token.number}
                </span>
              )}
              {/* Once a tube is drawn it needs a label before it leaves the chair. */}
              {visit.hasSamples && (
                <Link
                  href={`/lab/labels/${visit.id}`}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-500/10 dark:text-brand-300"
                >
                  <Tag className="h-3 w-3" /> {t('labels.print')}
                </Link>
              )}
              <span className="font-mono text-[11px] font-semibold tabular-nums text-subtle">#{visit.slipNo}</span>
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-subtle">
            <span className="truncate">
              {visit.mrNo}
              {visit.age != null && ` · ${visit.age}${t('common.years')}`}
              {visit.sex && ` · ${t(`reception.${visit.sex.toLowerCase()}`)}`}
            </span>
            <span aria-hidden>·</span>
            <span>{visit.lines.length} {t(visit.lines.length === 1 ? 'lab.test' : 'lab.tests')}</span>
            {overdueCount > 0 && (
              <span className="font-semibold text-danger-text">
                · {t('lab.nLate').replace('{n}', String(overdueCount))}
              </span>
            )}
          </div>
        </div>
      </div>

      {visit.notes && (
        <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info-text">
          <MessageSquareText className="mt-px h-3.5 w-3.5 shrink-0" aria-label={t('reception.notes')} />
          <span className="min-w-0 whitespace-pre-wrap break-words">{visit.notes}</span>
        </p>
      )}

      {groups.map((g) => (
        <StageGroup
          key={g.stage.key}
          stage={g.stage}
          lines={g.lines}
          visitId={visit.id}
          onAdvance={onAdvance}
          onCollectAll={onCollectAll}
          onUndo={onUndo}
          onRetake={onRetake}
          onDelay={onDelay}
        />
      ))}
    </article>
  );
}

function StageGroup({
  stage, lines, visitId, onAdvance, onCollectAll, onUndo, onRetake, onDelay,
}: {
  stage: Stage;
  lines: WorkLineDTO[];
  visitId: string;
  onAdvance: (id: string, to: string) => void;
  onCollectAll: (ids: string[]) => void;
  onUndo: (id: string) => void;
  onRetake: ReasonHandler;
  onDelay: ReasonHandler;
}) {
  const { t } = useI18n();

  // The draw list lives in the heading of the group it belongs to, so every
  // card has the same anatomy instead of some sprouting an extra strip.
  const drawable = stage.key === 'COLLECT' ? lines : [];
  const specimens = [...new Set(drawable.map((l) => l.specimenType))];

  return (
    <section>
      <SectionHeading
        accent={stage.accent}
        count={lines.length}
        meta={specimens.length > 0
          ? specimens.map((sp) => t(`specimen.${sp}`)).join(' · ')
          : undefined}
        action={drawable.length > 1 ? (
          <HeadingAction onClick={() => onCollectAll(drawable.map((l) => l.id))}>
            <Droplet className="h-3 w-3" />
            {t('lab.collectAllN').replace('{n}', String(drawable.length))}
          </HeadingAction>
        ) : undefined}
      >
        {t(stage.labelKey)}
      </SectionHeading>

      <RailGroup accent={stage.accent}>
        <RowList>
          {lines.map((l) => (
            <TestRow key={l.id} line={l} visitId={visitId} onAdvance={onAdvance} onUndo={onUndo} onRetake={onRetake} onDelay={onDelay} />
          ))}
        </RowList>
      </RailGroup>
    </section>
  );
}

interface ActionCfg { labelKey: string; icon: LucideIcon; variant: 'primary' | 'outline' | 'ghost'; advanceTo?: string; href?: string }
function lineAction(line: WorkLineDTO, visitId: string): ActionCfg | null {
  switch (line.status) {
    case 'BOOKED': return { labelKey: 'lab.collect', icon: Droplet, variant: 'primary', advanceTo: 'SAMPLE_COLLECTED' };
    case 'SAMPLE_DISPATCHED': return { labelKey: 'lab.receive', icon: PackageCheck, variant: 'primary', advanceTo: 'SAMPLE_RECEIVED' };
    // No separate "Start" press: a sample in hand goes straight to entry.
    case 'SAMPLE_COLLECTED':
    case 'SAMPLE_RECEIVED':
    case 'IN_PROGRESS': return { labelKey: 'lab.enterResults', icon: PencilLine, variant: 'primary', href: `/lab/result/${line.id}` };
    // A retake needs a fresh tube before anything can be entered.
    case 'RETAKE': return { labelKey: 'lab.recollect', icon: Droplet, variant: 'primary', advanceTo: 'SAMPLE_COLLECTED' };
    case 'RESULT_SAVED': return { labelKey: 'lab.review', icon: Eye, variant: 'outline', href: `/lab/result/${line.id}` };
    case 'APPROVED':
    case 'PRINTED':
    case 'DELIVERED': return { labelKey: 'lab.report', icon: Printer, variant: 'ghost', href: `/lab/report/${visitId}` };
    default: return null;
  }
}

type ReasonHandler = (orderLineId: string, reason: string) => Promise<boolean>;

const RETAKEABLE = new Set(['SAMPLE_COLLECTED', 'SAMPLE_RECEIVED', 'IN_PROGRESS']);

// Secondary row actions: quiet text links so the one main action keeps the space.
const SECONDARY =
  'inline-flex items-center gap-1 rounded text-xs font-medium text-muted transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-brand-300';

function TestRow({
  line, visitId, onAdvance, onUndo, onRetake, onDelay,
}: {
  line: WorkLineDTO;
  visitId: string;
  onAdvance: (id: string, to: string) => void;
  onUndo: (id: string) => void;
  onRetake: ReasonHandler;
  onDelay: ReasonHandler;
}) {
  // A reason is asked for in place — a retake or a delay without one tells the
  // next person nothing.
  const [asking, setAsking] = useState<'RETAKE' | 'DELAY' | 'SEND' | null>(null);
  const [refLabs, setRefLabs] = useState<{ id: string; name: string }[]>([]);
  const [refLab, setRefLab] = useState('');
  const toastRow = useToast();
  async function openSendOut() {
    setAsking('SEND');
    setReason('');
    const labs = await listOutwardPartnersAction().catch(() => []);
    setRefLabs(labs);
    setRefLab((cur) => cur || labs[0]?.id || '');
  }
  async function submitSendOut() {
    if (!refLab) return;
    setSaving(true);
    const res = await sendOutAction(line.id, refLab, reason);
    setSaving(false);
    if (res.ok) { toastRow('success', t('lab.sentOut')); setAsking(null); onAdvance(line.id, '__reload__'); }
    else toastRow('error', res.error);
  }
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  async function submitReason() {
    if (!asking || !reason.trim()) return;
    setSaving(true);
    const ok = await (asking === 'RETAKE' ? onRetake : onDelay)(line.id, reason.trim());
    setSaving(false);
    if (ok) { setAsking(null); setReason(''); }
  }
  const { t } = useI18n();
  const cfg = lineAction(line, visitId);
  const f = useFeatures();
  const overdue = isOverdue(line);
  const collectedNoResults = line.status === 'SAMPLE_COLLECTED' && !line.hasResults;
  const showSecondary = collectedNoResults || (!asking && ((f['lab.retake'] && RETAKEABLE.has(line.status) && !line.hasResults) || overdue));

  const btn = cfg && (
    <Button variant={cfg.variant} size="sm" onClick={cfg.advanceTo ? () => onAdvance(line.id, cfg.advanceTo!) : undefined}>
      <cfg.icon className="h-3.5 w-3.5" /> {t(cfg.labelKey)}
    </Button>
  );

  return (
    <Row className="flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-body">{line.testName}</span>
          {line.abnormal > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger-text">
              <AlertTriangle className="h-2.5 w-2.5" /> {line.abnormal}
            </span>
          )}
        </div>
        {/* Small print: the exact status (which is what decides the button) and,
            when late, by how much rather than a bare OVERDUE stamp. */}
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
          <span className="truncate">{t(`status.${line.status}`)}</span>
          {overdue && line.dueAt && (
            <span className="shrink-0 font-semibold text-danger-text">
              · {t('lab.lateBy').replace('{t}', lateBy(line.dueAt))}
            </span>
          )}
        </div>
        {showSecondary && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* A mis-tapped Collect is put right here, while nothing depends on it. */}
            {line.status === 'SAMPLE_COLLECTED' && !line.hasResults && (
              <button type="button" className={SECONDARY} onClick={() => onUndo(line.id)} title={t('lab.undoCollect')}>
                <Undo2 className="h-3.5 w-3.5" /> {t('lab.undo')}
              </button>
            )}
            {f['lab.retake'] && !asking && RETAKEABLE.has(line.status) && !line.hasResults && (
              <button type="button" className={SECONDARY} onClick={() => { setAsking('RETAKE'); setReason(''); }} title={t('lab.retakeReason')}>
                <RotateCcw className="h-3.5 w-3.5" /> {t('lab.retake')}
              </button>
            )}
            {f['lab.sendOut'] && !asking && line.status === 'SAMPLE_COLLECTED' && !line.hasResults && (
              <button type="button" className={SECONDARY} onClick={() => void openSendOut()} title={t('lab.sendOutHint')}>
                <Send className="h-3.5 w-3.5" /> {t('lab.sendOut')}
              </button>
            )}
            {!asking && overdue && (
              <button type="button" className={SECONDARY} onClick={() => { setAsking('DELAY'); setReason(line.delayReason ?? ''); }} title={t('lab.delayReason')}>
                <Clock className="h-3.5 w-3.5" /> {t('lab.delay')}
              </button>
            )}
          </div>
        )}
        {line.bookingRemarks && (
          <div className="mt-0.5 truncate text-xs text-brand-700 dark:text-brand-300">{t('lab.bookingNote').replace('{note}', line.bookingRemarks)}</div>
        )}
        {line.delayReason && (
          <div className="mt-0.5 truncate text-xs font-medium text-warn-text">{t('lab.delayed').replace('{reason}', line.delayReason)}</div>
        )}
        {line.outsourcedTo && (
          <div className="mt-0.5 truncate text-xs font-medium text-info-text">{t('lab.sentTo').replace('{lab}', line.outsourcedTo)}</div>
        )}
      </div>
      <div className="shrink-0">
        {cfg?.href ? <Link href={cfg.href}>{btn}</Link> : btn}
      </div>
      {asking && (
        <div className="basis-full">
          {asking === 'SEND' && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {refLabs.length === 0 ? (
                <span className="text-xs text-warn-text">{t('lab.noRefLabs')}</span>
              ) : (
                <>
                  <Select value={refLab} onChange={setRefLab} options={refLabs.map((l) => ({ value: l.id, label: l.name }))} className="min-w-40 flex-1" />
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={60}
                    placeholder={t('lab.refNo')}
                    aria-label={t('lab.refNo')}
                    className="field w-32 py-1.5 text-sm"
                  />
                  <Button size="sm" onClick={() => void submitSendOut()} loading={saving} disabled={!refLab}>{t('lab.sendOut')}</Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>{t('common.cancel')}</Button>
            </div>
          )}
          {asking && asking !== 'SEND' && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submitReason(); if (e.key === 'Escape') setAsking(null); }}
                maxLength={200}
                placeholder={asking === 'RETAKE' ? t('lab.retakeReason') : t('lab.delayReason')}
                aria-label={asking === 'RETAKE' ? t('lab.retakeReason') : t('lab.delayReason')}
                className="field min-w-40 flex-1 py-1.5 text-sm"
              />
              <Button size="sm" onClick={() => void submitReason()} loading={saving} disabled={!reason.trim()}>{t('lab.saveReason')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>{t('common.cancel')}</Button>
            </div>
          )}
        </div>
      )}
    </Row>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/60 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ok-soft text-ok-text">
        <PackageCheck className="h-6 w-6" />
      </div>
      <p className="font-medium text-muted">{label}</p>
    </div>
  );
}

function WorkboardSkeleton() {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5"><div className="skeleton h-3.5 w-1/2" /><div className="skeleton h-2.5 w-2/3" /></div>
          </div>
          <div className="skeleton mt-4 h-4 w-24" />
          <div className="mt-3 space-y-3"><div className="skeleton h-9 w-full" /><div className="skeleton h-9 w-full" /></div>
        </div>
      ))}
    </div>
  );
}
