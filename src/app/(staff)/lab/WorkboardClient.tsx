'use client';

import { useFeatures } from '@/core/features/FeaturesProvider';
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import {
  Search, Droplet, PencilLine, Eye, Printer, PackageCheck, AlertTriangle, Clock, Megaphone, MessageSquareText, MoreHorizontal, RotateCcw, Send, SlidersHorizontal, Tag, FileText, Undo2, X, type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Select } from '@/components/ui/Select';
import { listOutwardPartnersAction } from '@/modules/partners/partners.actions';
import { getQueueAction, callNextAction, type QueueTokenRow } from '@/modules/queue/queue.actions';
import { useI18n } from '@/core/i18n/I18nProvider';
import { usePoll } from '@/lib/use-poll';
import { Button } from '@/components/ui/Button';
import { ACCENT, type Accent } from '@/components/ui/List';
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
import type { BoardCounts } from '@/modules/lab/board-stages';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadError } from '@/components/ui/LoadError';
import { DatePicker } from '@/components/ui/DatePicker';

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
/** Statuses in workflow order, for the headings inside a card. */
const STATUS_ORDER = new Map<string, number>(
  STAGES.flatMap((s, si) => s.statuses.map((st, i) => [st, si * 100 + i] as const)),
);
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
  // Skeletons belong to the first load only. After that the board swaps cards
  // in place: a poll, a reconcile after an action or a new search must never
  // blank the list under the person working on it.
  const [firstLoad, setFirstLoad] = useState(true);
  // Counted by the server over everything the filter matches. The chips used to
  // tally the cards that loaded, so on a busy branch they under-reported the
  // work — the one number a phlebotomist must be able to trust.
  const [counts, setCounts] = useState<BoardCounts | null>(null);
  const [capped, setCapped] = useState<{ shown: number; total: number } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [, startTransition] = useTransition();
  // Which rows are waiting on the server, so each button can show its own wait.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const visitsRef = useRef(visits);
  visitsRef.current = visits;

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

  const load = useCallback(async (q?: string) => {
    try {
      const board = await getWorkboardAction(q, filtersRef.current);
      setVisits(board.visits);
      setCounts(board.counts);
      setCapped(board.capped ? { shown: board.visits.length, total: board.total } : null);
      setLoadFailed(false);
    } catch {
      // The cards already on screen are kept: stale work is more use than a
      // blank board, as long as the failure is stated.
      setLoadFailed(true);
    } finally {
      setFirstLoad(false);
    }
  }, []);

  // One place fetches the board: the first paint, a changed filter, or typing
  // that has paused. Three separate effects used to fire three requests before
  // the first card was even drawn.
  const queryRef = useRef(query);
  queryRef.current = query;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      void load(queryRef.current || undefined);
      return;
    }
    const id = setTimeout(() => void load(queryRef.current || undefined), 250);
    return () => clearTimeout(id);
  }, [query, filters, load]);

  // The waiting room, from the bench. Whoever draws the blood is the one who
  // calls the next patient in, and walking to the Queue screen to do it meant
  // leaving the list they work from.
  const [queue, setQueue] = useState<{ tokens: QueueTokenRow[]; nowServing: number | null } | null>(null);
  const [calling, setCalling] = useState(false);
  const loadQueue = useCallback(() => {
    getQueueAction().then((r) => setQueue({ tokens: r.tokens, nowServing: r.nowServing })).catch(() => setQueue(null));
  }, []);
  usePoll(loadQueue, 15000);

  function callNext() {
    if (calling) return;
    setCalling(true);
    callNextAction()
      .then((r) => { if (!r.ok) toast('error', t('lab.callFailed')); })
      .catch(() => toast('error', t('lab.callFailed')))
      .finally(() => { setCalling(false); void loadQueue(); void load(queryRef.current || undefined); });
  }

  /** Show the change at once, then let the server's answer settle it. */
  const patchLines = useCallback((ids: string[], patch: Partial<WorkLineDTO>) => {
    const touched = new Set(ids);
    setVisits((vs) => vs.map((v) => (v.lines.some((l) => touched.has(l.id))
      ? { ...v, lines: v.lines.map((l) => (touched.has(l.id) ? { ...l, ...patch } : l)) }
      : v)));
  }, []);

  /**
   * The row moves the moment it is pressed. The server is asked straight after,
   * and the board reconciles from its answer; a refusal puts the old rows back
   * and says why, so nothing is quietly wrong.
   */
  const act = useCallback(async (
    ids: string[],
    patch: Partial<WorkLineDTO>,
    run: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done?: string,
  ) => {
    const before = visitsRef.current;
    setBusy((b) => ({ ...b, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    patchLines(ids, patch);
    let res: { ok: true } | { ok: false; error: string };
    try {
      res = await run();
    } catch {
      res = { ok: false, error: t('lab.callFailed') };
    }
    setBusy((b) => {
      const next = { ...b };
      for (const id of ids) delete next[id];
      return next;
    });
    if (!res.ok) {
      setVisits(before);
      toast('error', res.error);
      return false;
    }
    if (done) toast('success', done);
    void load(queryRef.current || undefined);
    void loadQueue();
    return true;
  }, [load, loadQueue, patchLines, t, toast]);

  const advance = useCallback((orderLineId: string, to: string) => {
    if (to === '__reload__') { void load(queryRef.current || undefined); return; }
    startTransition(() => {
      void act([orderLineId], { status: to }, () => advanceAction({ orderLineId, to }));
    });
  }, [act, load]);

  const collectAll = useCallback((ids: string[]) => {
    startTransition(() => {
      void act(ids, { status: 'SAMPLE_COLLECTED' }, () => advanceManyAction(ids, 'SAMPLE_COLLECTED'));
    });
  }, [act]);

  const undoCollect = useCallback((orderLineId: string) => {
    startTransition(() => {
      void act([orderLineId], { status: 'BOOKED' }, () => undoCollectAction(orderLineId), t('lab.undone'));
    });
  }, [act, t]);

  const retake = useCallback(
    (orderLineId: string, reason: string) =>
      act([orderLineId], { status: 'RETAKE' }, () => requestRetakeAction(orderLineId, reason), t('lab.retakeDone')),
    [act, t],
  );

  const delay = useCallback(
    (orderLineId: string, reason: string) =>
      act([orderLineId], { delayReason: reason }, () => markDelayedAction(orderLineId, reason), t('lab.delayDone')),
    [act, t],
  );

  const waitingTokens = queue?.tokens.filter((tk) => tk.status === 'WAITING').length ?? 0;
  const nextToken = queue?.tokens.find((tk) => tk.status === 'WAITING') ?? null;
  const serving = queue?.nowServing != null
    ? queue.tokens.find((tk) => tk.status === 'CALLED' && tk.number === queue.nowServing) ?? null
    : null;

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
            {/* The waiting room sits beside the title: calling the next patient in
                is the first thing done at the bench, before any card is touched.
                Always drawn, at a fixed width: it used to appear after the first
                fetch and come and go with the poll, shoving the search box, the
                filter bar and every card. Empty, it just says nobody is waiting. */}
            <div className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface p-1.5 shadow-card sm:w-[26rem]">
              <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-brand-600 px-2 font-mono text-lg font-black tabular-nums text-white">
                {serving ? serving.number : '—'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-subtle">{t('lab.nowServing')}</div>
                <div className="truncate text-sm font-semibold text-strong">
                  {serving ? serving.patientName : t('lab.nobodyCalled')}
                  <span className="font-normal text-muted">
                    {' · '}
                    {nextToken && `${t('lab.upNext').replace('{n}', String(nextToken.number))} · `}
                    {waitingTokens === 0 ? t('queue.noneWaiting') : t('lab.waitingN').replace('{n}', String(waitingTokens))}
                  </span>
                </div>
              </div>
              <Button size="sm" className="shrink-0" onClick={callNext} loading={calling} disabled={!queue || waitingTokens === 0}>
                <Megaphone className="h-4 w-4" /> {t('lab.callNext')}
              </Button>
            </div>
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
      <div className="sticky top-[66px] z-10 -mx-2 flex items-center gap-2 bg-canvas/90 px-2 py-2 backdrop-blur-md">
        {/* One line at every width: narrow screens swipe the chips sideways rather than stacking them. */}
        <div className="-my-1 flex min-w-0 flex-1 gap-1.5 no-scrollbar overflow-x-auto py-1">
          <FilterChip
            label={t('lab.filterAll')}
            patients={counts?.ALL.patients ?? 0}
            tests={counts?.ALL.tests ?? 0}
            active={filter === 'ALL'} onClick={() => setFilter('ALL')}
          />
          {FILTER_STAGES.map((st) => (
            <FilterChip
              key={st.key} label={t(st.labelKey)}
              patients={counts?.[st.key as Exclude<StageKey, 'OTHER'>].patients ?? 0}
              tests={counts?.[st.key as Exclude<StageKey, 'OTHER'>].tests ?? 0}
              dot={st.accent.dot} active={filter === st.key} onClick={() => setFilter(st.key as FilterKey)}
            />
          ))}
        </div>
        <div className="ms-auto shrink-0">
          <Button size="sm" variant={activeFilters > 0 ? 'primary' : 'outline'} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-label={t('lab.filters')} title={t('lab.filters')}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('lab.filters')}</span>
            {activeFilters > 0 && ` (${activeFilters})`}
          </Button>
        </div>
      </div>

      {loadFailed && <LoadError onRetry={() => void load(queryRef.current || undefined)} />}

      {/* There is more work than fits on the board: say so rather than let the
          cards imply the day is done. */}
      {capped && (
        <p role="status" className="-mt-1 flex items-center gap-1.5 px-1 text-xs font-medium text-warn-text">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {t('lab.capped').replace('{shown}', String(capped.shown)).replace('{total}', String(capped.total))}
        </p>
      )}

      {filtersOpen && (
        <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="bf-from">{t('lab.filterFrom')}</label>
            <DatePicker id="bf-from" value={filters.from ?? ''} max={filters.to} onChange={(v) => setFilters((f) => ({ ...f, from: v || undefined }))} />
          </div>
          <div>
            <label className="label" htmlFor="bf-to">{t('lab.filterTo')}</label>
            <DatePicker id="bf-to" value={filters.to ?? ''} min={filters.from} onChange={(v) => setFilters((f) => ({ ...f, to: v || undefined }))} />
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

      {firstLoad ? (
        <WorkboardSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState label={filter === 'ALL' ? t('lab.noVisits') : t('lab.allClear')} />
      ) : (
        <div className="stagger flex items-start gap-4">
          {columns.map((col, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
              {col.map((v) => (
                <PatientCard key={v.id} visit={v} busy={busy} onAdvance={advance} onCollectAll={collectAll} onUndo={undoCollect} onRetake={retake} onDelay={delay} />
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
  const stages = new Set(v.lines.map((l) => l.status)).size;
  const lineExtras = v.lines.reduce((h, l) => h
    + (l.bookingRemarks ? 18 : 0) + (l.delayReason ? 18 : 0) + (l.outsourcedTo ? 18 : 0), 0);
  const signals = v.notes || v.lines.some(isOverdue) ? 30 + Math.ceil((v.notes?.length ?? 0) / 60) * 16 : 0;
  return 140 + (v.token?.status === 'CALLED' ? 26 : 0) + signals
    + stages * 26 + v.lines.length * 38 + lineExtras;
}

function FilterChip({
  label, patients, tests, dot, active, onClick,
}: { label: string; patients: number; tests: number; dot?: string; active: boolean; onClick: () => void }) {
  const { t } = useI18n();
  // One number on the chip — patients, which is how many cards the filter shows.
  // The test count is still a hover away, rather than a second figure beside it.
  const patientsText = patients === 1 ? t('lab.onePatient') : t('lab.patientsN').replace('{n}', String(patients));
  const testsText = tests === 1 ? t('lab.oneTest') : t('lab.testsN').replace('{n}', String(tests));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${patientsText} · ${testsText}`}
      className={cn(
        // Hover darkens the chip a step rather than tinting the text, so the label
        // stays as readable while the pointer is on it as before.
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm hover:border-brand-700 hover:bg-brand-700'
          : 'border-line bg-surface text-body hover:border-line-strong hover:bg-surface-2 hover:text-strong',
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-white' : dot)} />}
      {label}
      <span className={cn('min-w-4 rounded-full px-1.5 text-center text-[10.5px] leading-4 tabular-nums', active ? 'bg-white/25 text-white' : 'bg-surface-3 text-strong')}>
        {patients}
      </span>
    </button>
  );
}

/**
 * The patient card reads top to bottom as four questions: who is this, does
 * anything need attention, is there something to do for the whole patient
 * (collect every tube, open the finished report), and where does each test
 * stand. Every test carries its own action in the same place on its row, so
 * the card has one shape whether it holds one test or ten; the rarer row
 * actions sit behind that row's ⋯ menu.
 */
const PatientCard = memo(function PatientCard({
  visit, busy, onAdvance, onCollectAll, onUndo, onRetake, onDelay,
}: {
  visit: WorkVisitDTO;
  /** Rows waiting on the server, keyed by test id. */
  busy: Record<string, boolean>;
  onAdvance: (id: string, to: string) => void;
  onCollectAll: (ids: string[]) => void;
  onUndo: (id: string) => void;
  onRetake: ReasonHandler;
  onDelay: ReasonHandler;
}) {
  const { t } = useI18n();
  const overdueCount = visit.lines.filter(isOverdue).length;
  const called = visit.token?.status === 'CALLED';
  const step = useMemo(() => nextStep(visit), [visit]);
  // Menus open over the page, outside the card, so moving onto one used to
  // count as leaving the card and it dropped back mid-choice. While any of this
  // card's menus is open it stays lifted as if still hovered.
  const [menusOpen, setMenusOpen] = useState(0);
  const holdLift = useCallback((open: boolean) => setMenusOpen((n) => Math.max(0, n + (open ? 1 : -1))), []);

  // Tests bucketed by their exact status, in workflow order. By status and not
  // by stage, because then the heading says what the rows are waiting on and
  // the rows themselves need no second line repeating it under every name.
  const groups = useMemo(() => {
    const by = new Map<string, WorkLineDTO[]>();
    for (const l of visit.lines) {
      const at = by.get(l.status);
      if (at) at.push(l); else by.set(l.status, [l]);
    }
    return [...by.entries()]
      .sort((a, b) => (STATUS_ORDER.get(a[0]) ?? 999) - (STATUS_ORDER.get(b[0]) ?? 999))
      .map(([status, lines]) => ({ status, stage: stageOf(status), lines }));
  }, [visit.lines]);

  const ageSex = [
    visit.age != null ? `${visit.age} ${t('common.years')}` : null,
    visit.sex ? t(`reception.${visit.sex.toLowerCase()}`) : null,
  ].filter(Boolean).join(' · ');

  const cardMenu: MenuItem[] = [
    ...(visit.lines.some((l) => l.status !== 'CANCELLED')
      ? [{ key: 'labels', label: t('labels.print'), icon: Tag, href: `/lab/labels/${visit.id}` }]
      : []),
    { key: 'slip', label: t('lab.openSlip'), icon: FileText, href: `/reception/${visit.id}` },
    ...(visit.lines.some((l) => READY.has(l.status))
      ? [{ key: 'report', label: t('lab.openReport'), icon: Printer, href: `/lab/report/${visit.id}` }]
      : []),
  ];

  return (
    <CardHoldContext.Provider value={holdLift}>
    <article
      aria-labelledby={`patient-${visit.id}`}
      className={cn('card card-hover overflow-hidden', menusOpen > 0 && '-translate-y-0.5 shadow-card-hover', called && 'ring-2 ring-brand-500/60')}
    >
      {/* Called is said once, in words, across the top — not squeezed into a pill beside the name. */}
      {called && (
        <div className="flex items-center gap-2 bg-brand-600 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          {t('lab.nowCalling')}
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          {visit.token
            ? <TokenTicket number={visit.token.number} called={called} />
            : (
              <div aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-700 dark:text-brand-300">
                {initials(visit.patientName)}
              </div>
            )}
          <div className="min-w-0 flex-1">
            <h2 id={`patient-${visit.id}`} className="break-words font-semibold leading-snug text-strong">{visit.patientName}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-subtle">
              <span className="font-mono tabular-nums">{visit.mrNo}</span>
              {ageSex && <><span aria-hidden className="text-line-strong">·</span><span>{ageSex}</span></>}
              <span aria-hidden className="text-line-strong">·</span>
              <span className="font-mono tabular-nums">{t('lab.slipNo').replace('{n}', visit.slipNo)}</span>
            </div>
          </div>
          <ActionMenu label={t('lab.cardActions')} items={cardMenu} />
        </div>

        {/* Attention first, in one colour each, as text — a tinted box per signal
            turned the top of the card into a stack of blocks. */}
        {(overdueCount > 1 || visit.notes) && (
          <div className="space-y-1 text-xs">
            {/* Only worth summarising when more than one test is late: a single
                late test already says so on its own row. */}
            {overdueCount > 1 && (
              <p className="flex items-center gap-1.5 font-semibold text-danger-text">
                <Clock className="h-3 w-3 shrink-0" /> {t('lab.nTestsLate').replace('{n}', String(overdueCount))}
              </p>
            )}
            {visit.notes && (
              <p className="flex items-start gap-1.5 text-muted">
                <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" aria-label={t('reception.notes')} />
                <span className="min-w-0 whitespace-pre-wrap break-words">{visit.notes}</span>
              </p>
            )}
          </div>
        )}

        <NextStepBand
          visitId={visit.id}
          step={step}
          busy={step.kind === 'collectAll' && step.lines.some((l) => busy[l.id])}
          onCollectAll={onCollectAll}
        />

        <div>
          {groups.map((g) => (
            <section key={g.status} aria-label={t(`status.${g.status}`)}>
              {/* Always drawn, so a card holding one test has the same shape as
                  a card holding ten. The dot is the stage's colour. */}
              <h3 className="flex items-center gap-1.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                <span className={cn('h-1.5 w-1.5 rounded-full', g.stage.accent.dot)} />
                {t(`status.${g.status}`)}
              </h3>
              <ul className="divide-y divide-line">
                {g.lines.map((l) => (
                  <TestRow
                    key={l.id}
                    line={l}
                    visitId={visit.id}
                    busy={!!busy[l.id]}
                    onAdvance={onAdvance}
                    onUndo={onUndo}
                    onRetake={onRetake}
                    onDelay={onDelay}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </article>
    </CardHoldContext.Provider>
  );
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** The waiting-room token as a paper ticket, in the avatar's place so names line up down the board. */
function TokenTicket({ number, called }: { number: number; called: boolean }) {
  const { t } = useI18n();
  return (
    <div
      aria-label={`${t('queue.token')} ${number}`}
      className={cn(
        'ticket-notch grid h-11 w-11 shrink-0 place-content-center justify-items-center gap-0.5 rounded-[9px] border',
        called ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface-2 text-strong',
      )}
    >
      <span aria-hidden className={cn('text-[8px] font-bold uppercase leading-none tracking-[0.1em]', called ? 'text-white/75' : 'text-subtle')}>
        {t('queue.token')}
      </span>
      <span aria-hidden className="font-mono text-[17px] font-bold leading-none tabular-nums">{number}</span>
    </div>
  );
}

/**
 * Which tube or container a test is drawn into: a small tube with the cap
 * colour phlebotomists already know, and the tube named in words on the row.
 * It is deliberately shaped like a tube and never a dot, so it cannot be read
 * as the stage colour that the headings use.
 */
const TUBE: Record<string, { kind: 'tube' | 'jar' | 'swab'; cap: string }> = {
  BLOOD: { kind: 'tube', cap: 'fill-violet-400' },
  SERUM: { kind: 'tube', cap: 'fill-amber-400' },
  PLASMA: { kind: 'tube', cap: 'fill-sky-400' },
  URINE: { kind: 'jar', cap: 'fill-amber-500' },
  STOOL: { kind: 'jar', cap: 'fill-orange-700' },
  SWAB: { kind: 'swab', cap: 'fill-teal-500' },
};

function TubeMarker({ specimen, className }: { specimen: string; className?: string }) {
  const { t } = useI18n();
  const { kind, cap } = TUBE[specimen] ?? { kind: 'tube' as const, cap: 'fill-line-strong' };
  const label = t(`tube.${specimen}`);
  // Glass is the card's own surface with a hairline edge, so the only colour on
  // the marker is the cap and what is inside it.
  const glass = 'fill-surface-2 stroke-line-strong';
  return (
    <svg
      viewBox="0 0 16 19"
      role="img"
      className={cn('h-[19px] w-4 shrink-0', className)}
      strokeWidth="1"
      strokeLinejoin="round"
    >
      <title>{label}</title>
      {kind === 'tube' && (
        <>
          <path d="M4.6 5.8h6.8v8.1a3.4 3.4 0 0 1-6.8 0z" className={glass} />
          <path d="M4.6 10.4h6.8v3.5a3.4 3.4 0 0 1-6.8 0z" className={cn(cap, 'opacity-70')} stroke="none" />
          <rect x="4.35" y="4.7" width="7.3" height="1.6" rx="0.6" className={cn(cap, 'opacity-80')} stroke="none" />
          <rect x="3.8" y="1.3" width="8.4" height="4" rx="1.4" className={cap} stroke="none" />
        </>
      )}
      {kind === 'jar' && (
        <>
          <path d="M3.4 5.6h9.2v9.15a2.25 2.25 0 0 1-2.25 2.25H5.65A2.25 2.25 0 0 1 3.4 14.75z" className={glass} />
          <path d="M3.4 11h9.2v3.75A2.25 2.25 0 0 1 10.35 17H5.65A2.25 2.25 0 0 1 3.4 14.75z" className={cn(cap, 'opacity-55')} stroke="none" />
          <rect x="2.4" y="1.4" width="11.2" height="4.2" rx="1.4" className={cap} stroke="none" />
        </>
      )}
      {kind === 'swab' && (
        <>
          <path d="M8 7.5v9.5" className="stroke-line-strong" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="8" cy="4.9" rx="3.1" ry="3.9" className={cap} stroke="none" />
        </>
      )}
    </svg>
  );
}

type NextStep =
  | { kind: 'collectAll'; lines: WorkLineDTO[] }
  | { kind: 'done' }
  | { kind: 'none' };

/**
 * An action for the whole patient, when there is one. Anything a single test
 * needs is on that test's row instead, so the band never takes a row's button.
 */
function nextStep(visit: WorkVisitDTO): NextStep {
  const active = visit.lines.filter((l) => l.status !== 'CANCELLED');
  const drawable = active.filter((l) => l.status === 'BOOKED');
  if (drawable.length > 1) return { kind: 'collectAll', lines: drawable };
  if (active.length > 0 && active.every((l) => READY.has(l.status))) return { kind: 'done' };
  return { kind: 'none' };
}

function NextStepBand({
  visitId, step, busy, onCollectAll,
}: {
  visitId: string;
  step: NextStep;
  busy: boolean;
  onCollectAll: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  if (step.kind === 'none') return null;

  // The button says what it does, so the panel around it — a tint, a heading
  // and a repeat of the tubes already drawn on every row — only added weight.
  if (step.kind === 'done') {
    return (
      <Link href={`/lab/report/${visitId}`} className="block">
        <Button variant="outline" className="w-full"><Printer className="h-4 w-4" /> {t('lab.openReport')}</Button>
      </Link>
    );
  }

  return (
    <Button className="w-full" loading={busy} onClick={() => onCollectAll(step.lines.map((l) => l.id))}>
      <Droplet className="h-4 w-4" /> {t('lab.collectAllSamples').replace('{n}', String(step.lines.length))}
    </Button>
  );
}

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  onSelect?: () => void;
  hint?: string;
  /** Items sharing a group sit under one small heading, groups split by a rule. */
  group?: string;
}

/**
 * A ⋯ button with a small menu, portalled to <body> and placed position:fixed
 * against the trigger. It cannot live inside the card: the card lifts on hover
 * and the board animates in, and a transformed ancestor turns position:fixed
 * into "relative to that ancestor" — the menu then opened inside the card's
 * clipped box, out of sight.
 */
/** Lets a card stay lifted while a menu opened from inside it is showing. */
const CardHoldContext = createContext<(open: boolean) => void>(() => {});

function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  // Opened with Enter or Space, focus goes to the first item so arrow keys work
  // at once. Opened with the mouse, focus stays on the menu itself, so no item
  // looks picked before the pointer reaches it.
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const holdLift = useContext(CardHoldContext);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom > 240 || window.innerHeight - r.bottom > r.top;
    setPos({
      top: below ? r.bottom + 4 : undefined,
      bottom: below ? undefined : window.innerHeight - r.top + 4,
      right: Math.max(8, window.innerWidth - r.right),
    });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    holdLift(true);
    return () => holdLift(false);
  }, [open, holdLift]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!menuRef.current?.contains(n) && !btnRef.current?.contains(n)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !pos) return;
    // preventScroll: focusing must not scroll the page, which would close the menu.
    const target = viaKeyboard ? menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]') : menuRef.current;
    target?.focus({ preventScroll: true });
  }, [open, pos, viaKeyboard]);

  if (items.length === 0) return null;

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    // From the menu itself (opened by mouse), Down starts at the first item and Up at the last.
    const next = i < 0 ? (e.key === 'ArrowDown' ? 0 : els.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
    els[next]?.focus({ preventScroll: true });
  }

  const itemCls = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-body transition-colors hover:bg-surface-2 hover:text-strong focus:outline-none focus-visible:bg-surface-2 focus-visible:text-strong';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        // detail is 0 when the click came from Enter or Space rather than a pointer.
        onClick={(e) => { setViaKeyboard(e.detail === 0); setOpen((o) => !o); }}
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-muted transition-colors hover:border-line hover:bg-surface-2 hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          open && 'border-line bg-surface-2 text-strong',
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, right: pos.right, zIndex: 60 }}
          className="min-w-52 max-w-[calc(100vw-16px)] rounded-xl border border-line bg-surface p-1 shadow-dropdown animate-scale-in focus:outline-none"
        >
          {items.map((it, i) => {
            const newGroup = it.group !== items[i - 1]?.group;
            const content = (
              <>
                <it.icon className="h-4 w-4 shrink-0 text-muted" />
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-xs text-subtle">{it.hint}</span>}
              </>
            );
            return (
              <div key={it.key}>
                {newGroup && i > 0 && <div role="separator" className="mx-1 my-1 border-t border-line" />}
                {newGroup && it.group && (
                  <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">{it.group}</div>
                )}
                {it.href ? (
                  <Link role="menuitem" href={it.href} className={itemCls} onClick={() => setOpen(false)}>{content}</Link>
                ) : (
                  <button role="menuitem" type="button" className={itemCls} onClick={() => { setOpen(false); it.onSelect?.(); }}>{content}</button>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

interface ActionCfg { labelKey: string; icon: LucideIcon; variant: 'primary' | 'outline' | 'ghost'; advanceTo?: string; href?: string }
function lineAction(line: WorkLineDTO): ActionCfg | null {
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
    // Released tests have nothing left to do on the row; the report is for the
    // whole patient and sits in the card's band and ⋯ menu.
    default: return null;
  }
}

type ReasonHandler = (orderLineId: string, reason: string) => Promise<boolean>;

const RETAKEABLE = new Set(['SAMPLE_COLLECTED', 'SAMPLE_RECEIVED', 'IN_PROGRESS']);

const TestRow = memo(function TestRow({
  line, busy, onAdvance, onUndo, onRetake, onDelay,
}: {
  line: WorkLineDTO;
  visitId: string;
  /** This row is waiting on the server. */
  busy: boolean;
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
  const cfg = lineAction(line);
  const f = useFeatures();
  const overdue = isOverdue(line);

  // Everything besides the row's main action, grouped by what it is for.
  const fix = t('lab.fixSample');
  const route = t('lab.route');
  const menu: MenuItem[] = [
    // A mis-tapped Collect is put right here, while nothing depends on it.
    ...(line.status === 'SAMPLE_COLLECTED' && !line.hasResults
      ? [{ key: 'undo', group: fix, label: t('lab.undoCollectShort'), icon: Undo2, onSelect: () => onUndo(line.id) }]
      : []),
    ...(f['lab.retake'] && RETAKEABLE.has(line.status) && !line.hasResults
      ? [{ key: 'retake', group: fix, label: `${t('lab.retake')}…`, hint: t('lab.asksWhy'), icon: RotateCcw, onSelect: () => { setAsking('RETAKE'); setReason(''); } }]
      : []),
    ...(f['lab.sendOut'] && line.status === 'SAMPLE_COLLECTED' && !line.hasResults
      ? [{ key: 'send', group: route, label: `${t('lab.sendOut')}…`, icon: Send, onSelect: () => void openSendOut() }]
      : []),
    ...(overdue
      ? [{ key: 'delay', group: route, label: `${t(line.delayReason ? 'lab.changeDelay' : 'lab.delay')}…`, hint: t('lab.asksWhy'), icon: Clock, onSelect: () => { setAsking('DELAY'); setReason(line.delayReason ?? ''); } }]
      : []),
  ];

  const btn = cfg && (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={cfg.advanceTo ? () => onAdvance(line.id, cfg.advanceTo!) : undefined}
    >
      <cfg.icon className="h-3.5 w-3.5" /> {t(cfg.labelKey)}
    </Button>
  );

  return (
    <li className="py-2.5 last:pb-0">
      <div className="flex items-start gap-2.5">
        <TubeMarker specimen={line.specimenType} className="mt-px" />
        <div className="min-w-0 flex-1">
          {/* The status is the heading above; the tube is drawn at the head of
              the row. So the line carries the name and only what is wrong. */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="break-words text-sm font-semibold text-strong">{line.testName}</span>
            {line.abnormal > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger-text">
                <AlertTriangle className="h-2.5 w-2.5" /> {line.abnormal}
              </span>
            )}
            {overdue && line.dueAt && (
              <span className="shrink-0 text-xs font-semibold text-danger-text">{t('lab.lateBy').replace('{t}', lateBy(line.dueAt))}</span>
            )}
          </div>
          {line.bookingRemarks && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-brand-700 dark:text-brand-300">
              <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{t('lab.bookingNote').replace('{note}', line.bookingRemarks)}</span>
            </p>
          )}
          {line.delayReason && (
            <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-warn-text">
              <Clock className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{t('lab.delayed').replace('{reason}', line.delayReason)}</span>
            </p>
          )}
          {line.outsourcedTo && (
            <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-info-text">
              <Send className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{t('lab.sentTo').replace('{lab}', line.outsourcedTo)}</span>
            </p>
          )}
        </div>
        {(btn || menu.length > 0) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {cfg?.href ? <Link href={cfg.href}>{btn}</Link> : btn}
            <ActionMenu label={t('lab.moreFor').replace('{test}', line.testName)} items={menu} />
          </div>
        )}
      </div>

      {asking && (
        <div className="mt-2 rounded-lg border border-line bg-surface-2 p-2.5 ms-5">
          {asking === 'SEND' ? (
            <div className="flex flex-wrap items-center gap-1.5">
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
          ) : (
            <div className="space-y-1.5">
              <label htmlFor={`reason-${line.id}`} className="block text-xs font-semibold text-body">
                {asking === 'RETAKE' ? t('lab.retakeReason') : t('lab.delayReason')}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  id={`reason-${line.id}`}
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submitReason(); if (e.key === 'Escape') setAsking(null); }}
                  maxLength={200}
                  className="field min-w-40 flex-1 py-1.5 text-sm"
                />
                <Button size="sm" onClick={() => void submitReason()} loading={saving} disabled={!reason.trim()}>{t('lab.saveReason')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>{t('common.cancel')}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
});

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
