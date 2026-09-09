'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search, ShieldCheck, Droplet, Play, PencilLine, Eye, Printer,
  PackageCheck, AlertTriangle, type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { ACCENT, SectionHeading, HeadingAction, RailGroup, RowList, Row, type Accent } from '@/components/ui/List';
import { cn } from '@/lib/utils';
import {
  getWorkboardAction,
  advanceAction,
  advanceManyAction,
  type WorkVisitDTO,
  type WorkLineDTO,
} from '@/modules/lab/lab.actions';

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

const SPECIMEN_LABEL: Record<string, string> = {
  BLOOD: 'Blood', SERUM: 'Serum', PLASMA: 'Plasma',
  URINE: 'Urine', STOOL: 'Stool', SWAB: 'Swab', OTHER: 'Other',
};

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
  const [query, setQuery] = useState('');
  // The dashboard links straight to a stage, so a technician lands on the
  // list they clicked rather than on everything.
  const params = useSearchParams();
  const initial = params.get('stage');
  const [filter, setFilter] = useState<FilterKey>(
    initial && FILTER_STAGES.some((s) => s.key === initial) ? (initial as FilterKey) : 'ALL',
  );
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const load = useCallback((q?: string) => {
    setLoading(true);
    getWorkboardAction(q).then(setVisits).catch(() => setVisits([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(query || undefined), 300);
    return () => clearTimeout(debounce.current);
  }, [query, load]);

  function advance(orderLineId: string, to: string) {
    startTransition(async () => {
      const res = await advanceAction({ orderLineId, to });
      if (res.ok) load(query || undefined);
    });
  }

  function collectAll(ids: string[]) {
    startTransition(async () => {
      const res = await advanceManyAction(ids, 'SAMPLE_COLLECTED');
      if (res.ok) load(query || undefined);
    });
  }

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { ALL: 0, COLLECT: 0, PROGRESS: 0, APPROVAL: 0, READY: 0 };
    for (const v of visits) for (const l of v.lines) {
      c.ALL += 1;
      const s = stageOf(l.status);
      if (s.key !== 'OTHER') c[s.key as Exclude<StageKey, 'OTHER'>] += 1;
    }
    return c;
  }, [visits]);

  // Whole patient cards are kept; filtering picks which cards to show, never
  // which tests inside them. Cards needing attention float up: overdue first,
  // then still-active, then finished.
  const shown = useMemo(() => {
    const list = filter === 'ALL'
      ? visits.slice()
      : visits.filter((v) => v.lines.some((l) => stageOf(l.status).key === filter));
    const rank = (v: WorkVisitDTO) =>
      v.lines.some(isOverdue) ? 0 : v.lines.some((l) => !READY.has(l.status)) ? 1 : 2;
    return list.sort((a, b) => rank(a) - rank(b) || a.patientName.localeCompare(b.patientName));
  }, [visits, filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('lab.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 h-4 w-4 text-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('lab.search')} className="field ps-10" />
          </div>
          <Link href="/lab/approvals"><Button variant="outline"><ShieldCheck className="h-4 w-4" /> {t('lab.approvals')}</Button></Link>
        </div>
      </div>

      {/* Filter chips double as the colour key: every chip shows the same dot
          that heads its group inside the cards. */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={t('lab.filterAll')} count={counts.ALL}
          active={filter === 'ALL'} onClick={() => setFilter('ALL')}
        />
        {FILTER_STAGES.map((s) => (
          <FilterChip
            key={s.key} label={t(s.labelKey)} count={counts[s.key as Exclude<StageKey, 'OTHER'>]}
            dot={s.accent.dot} active={filter === s.key} onClick={() => setFilter(s.key as FilterKey)}
          />
        ))}
      </div>

      {loading ? (
        <WorkboardSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState label={filter === 'ALL' ? t('lab.noVisits') : t('lab.allClear')} />
      ) : (
        <div className="stagger grid items-start gap-4 md:grid-cols-2">
          {shown.map((v) => (
            <PatientCard key={v.id} visit={v} onAdvance={advance} onCollectAll={collectAll} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label, count, dot, active, onClick,
}: { label: string; count: number; dot?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all',
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-line bg-surface text-muted hover:border-brand-300 hover:text-brand-600',
      )}
    >
      {dot && <span className={cn('h-2 w-2 rounded-full', active ? 'bg-white/80' : dot)} />}
      {label}
      <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/20' : 'bg-surface-3 text-muted')}>
        {count}
      </span>
    </button>
  );
}

function PatientCard({
  visit, onAdvance, onCollectAll,
}: {
  visit: WorkVisitDTO;
  onAdvance: (id: string, to: string) => void;
  onCollectAll: (ids: string[]) => void;
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
      className="card card-hover space-y-4 p-4"
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
            <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-subtle">#{visit.slipNo}</span>
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

      {groups.map((g) => (
        <StageGroup
          key={g.stage.key}
          stage={g.stage}
          lines={g.lines}
          visitId={visit.id}
          onAdvance={onAdvance}
          onCollectAll={onCollectAll}
        />
      ))}
    </article>
  );
}

function StageGroup({
  stage, lines, visitId, onAdvance, onCollectAll,
}: {
  stage: Stage;
  lines: WorkLineDTO[];
  visitId: string;
  onAdvance: (id: string, to: string) => void;
  onCollectAll: (ids: string[]) => void;
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
          ? specimens.map((sp) => SPECIMEN_LABEL[sp] ?? sp).join(' · ')
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
            <TestRow key={l.id} line={l} visitId={visitId} onAdvance={onAdvance} />
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
    case 'SAMPLE_COLLECTED':
    case 'SAMPLE_RECEIVED': return { labelKey: 'lab.start', icon: Play, variant: 'primary', advanceTo: 'IN_PROGRESS' };
    case 'RETAKE':
    case 'IN_PROGRESS': return { labelKey: 'lab.enterResults', icon: PencilLine, variant: 'primary', href: `/lab/result/${line.id}` };
    case 'RESULT_SAVED': return { labelKey: 'lab.review', icon: Eye, variant: 'outline', href: `/lab/result/${line.id}` };
    case 'APPROVED':
    case 'PRINTED':
    case 'DELIVERED': return { labelKey: 'lab.report', icon: Printer, variant: 'ghost', href: `/lab/report/${visitId}` };
    default: return null;
  }
}

function TestRow({ line, visitId, onAdvance }: { line: WorkLineDTO; visitId: string; onAdvance: (id: string, to: string) => void }) {
  const { t } = useI18n();
  const cfg = lineAction(line, visitId);
  const overdue = isOverdue(line);

  const btn = cfg && (
    <Button variant={cfg.variant} size="sm" onClick={cfg.advanceTo ? () => onAdvance(line.id, cfg.advanceTo!) : undefined}>
      <cfg.icon className="h-3.5 w-3.5" /> {t(cfg.labelKey)}
    </Button>
  );

  return (
    <Row>
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
      </div>
      <div className="shrink-0">{cfg?.href ? <Link href={cfg.href}>{btn}</Link> : btn}</div>
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
