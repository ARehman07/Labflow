'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  CreditCard, UserPlus, Plus, Search, ArrowLeft, Check, AlertTriangle, ChevronRight, Phone, X,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { ACCENT, SectionHeading, RailGroup } from '@/components/ui/List';
import { cn, formatPkr } from '@/lib/utils';
import {
  listCardsAction,
  findCardByMobileAction,
  issueCardAction,
  addCardMemberAction,
  getCardPolicyAction,
  type FamilyCardDTO,
  type CardSummaryDTO,
} from '@/modules/familycard/familycard.actions';
import { searchPatientsAction, type PatientDTO } from '@/modules/reception/reception.actions';
import { AddPatientForm } from '@/components/patients/AddPatientForm';
import { Select } from '@/components/ui/Select';
import { MEMBER_RELATIONS, type Relation } from '@/modules/familycard/familycard.rules';
import { Tr } from '@/components/ui/Tr';

/** Below this many characters a search is not run and nothing is shown. */
const MIN_QUERY = 2;

/**
 * Family cards, reached by lookup.
 *
 * Cards are shown only in answer to a search — never as a full register on
 * arrival. The server enforces the same rule (see listCardsAction), so an
 * empty search returns nothing rather than the page merely hiding it.
 *
 * Issuing a card and adding someone to one stay explicit buttons in the
 * header, in the same words and order as the booking screen.
 */
export function FamilyCardsClient() {
  const { t } = useI18n();
  const [view, setView] = useState<'LIST' | 'NEW' | 'JOIN'>('LIST');
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<CardSummaryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [openCard, setOpenCard] = useState<FamilyCardDTO | null>(null);
  const [policy, setPolicy] = useState({ fee: 0, discountPct: 0, discountOnIssue: true });

  const searching = query.trim().length >= MIN_QUERY;

  const loadList = useCallback((q: string) => {
    if (q.trim().length < MIN_QUERY) { setCards([]); setLoading(false); return; }
    setLoading(true);
    listCardsAction(q).then(setCards).catch(() => setCards([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getCardPolicyAction().then(setPolicy).catch(() => {});
  }, []);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY) { setCards([]); setLoading(false); return; }
    setLoading(true);
    const id = setTimeout(() => loadList(query), 250);
    return () => clearTimeout(id);
  }, [query, loadList]);

  const openDetail = useCallback((mobile: string) => {
    findCardByMobileAction(mobile).then(setOpenCard).catch(() => setOpenCard(null));
  }, []);

  function refreshDetail() {
    if (openCard) openDetail(openCard.mobile);
    loadList(query);
  }

  // ── Detail ──────────────────────────────────────────────
  if (openCard) {
    return (
      <CardDetail
        card={openCard}
        onBack={() => { setOpenCard(null); loadList(query); }}
        onChanged={refreshDetail}
      />
    );
  }

  // ── Add someone to an existing card ─────────────────────
  if (view === 'JOIN') {
    return (
      <JoinCard
        onCancel={() => setView('LIST')}
        onJoined={(mobile) => { setView('LIST'); openDetail(mobile); }}
      />
    );
  }

  // ── New card ────────────────────────────────────────────
  if (view === 'NEW') {
    return (
      <NewCard
        policy={policy}
        onCancel={() => setView('LIST')}
        onCreated={(mobile) => { setView('LIST'); openDetail(mobile); }}
      />
    );
  }

  // ── Lookup ──────────────────────────────────────────────
  return (
    <div className="page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-strong">
            <CreditCard className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            {t('familyCard.title')}
          </h1>
          <p className="text-sm text-muted">
            {t('familyCard.subtitle').replace('{pct}', String(policy.discountPct))}
          </p>
        </div>
        {/* The same two actions as the booking screen, in the same words and
            the same order, so staff learn one model rather than two. */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setView('JOIN')}>
            <UserPlus className="h-4 w-4" /> {t('reception.cardJoin')}
          </Button>
          <Button onClick={() => setView('NEW')}>
            <Plus className="h-4 w-4" /> {t('reception.cardCreate')}
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <label className="label" htmlFor="card-lookup">{t('familyCard.lookupTitle')}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
          <input
            id="card-lookup"
            className="field py-3 pe-10 ps-10 text-base"
            placeholder={t('familyCard.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('familyCard.clear')}
              title={t('familyCard.clear')}
              className="absolute inset-y-0 end-0 my-auto me-2 grid h-7 w-7 place-items-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-body"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t('familyCard.lookupHint')}</p>
      </Card>

      {!searching ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <Search className="h-6 w-6" />
          </span>
          <p className="font-semibold text-strong">{t('familyCard.lookupPromptTitle')}</p>
          <p className="max-w-sm text-sm text-muted">{t('familyCard.lookupPrompt')}</p>
        </Card>
      ) : loading ? (
        <Card className="space-y-2 p-3" aria-busy="true">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </Card>
      ) : cards.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle">
            <CreditCard className="h-6 w-6" />
          </span>
          <p className="text-muted">{t('familyCard.noMatches')}</p>
          <Button onClick={() => setView('NEW')}>
            <Plus className="h-4 w-4" /> {t('reception.cardCreate')}
          </Button>
        </Card>
      ) : (
        <Card className="p-2">
          <div className="section-title px-3 pb-1 pt-2">
            {t('familyCard.resultsCount').replace('{n}', String(cards.length))}
          </div>
          <ul className="stagger space-y-0.5">
            {cards.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => openDetail(c.mobile)}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors hover:bg-surface-2"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/12 text-sm font-bold text-brand-600 dark:text-brand-300">
                    {c.holderName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-strong">{c.holderName}</span>
                      {!c.isActive && <Badge tone="neutral" size="sm">{t('familyCard.inactive')}</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-subtle">
                      <span className="font-mono">{c.mobile}</span> · {c.holderMrNo}
                    </span>
                    <SlotsBar used={c.used} cap={c.cap} label={t('familyCard.slotsUsed')} />
                  </span>
                  <Badge tone="success">{t('familyCard.off').replace('{pct}', String(c.discountPct))}</Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-body rtl:rotate-180" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** How full a card is, as a bar — "4/6" alone takes a moment to read. */
function SlotsBar({ used, cap, label }: { used: number; cap: number; label: string }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const full = used >= cap;
  return (
    <span className="mt-2 flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
        <span
          className={cn('block h-full rounded-full', full ? 'bg-status-progress' : 'bg-brand-500')}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-xs text-muted tabular-nums">{used}/{cap} {label}</span>
    </span>
  );
}

/**
 * Choose a person: someone already registered, or register them now.
 *
 * The same two tabs as the booking screen. Each flow on this page used to put a
 * search box and a "New patient" button side by side with nothing saying which
 * to use; this asks the one question that matters — have they been here before?
 */
function PatientPicker({ onPick }: { onPick: (p: PatientDTO) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientDTO[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      if (q.trim().length < MIN_QUERY) { setResults([]); setSearched(false); return; }
      searchPatientsAction(q)
        .then((r) => { setResults(r); setSearched(true); })
        .catch(() => { setResults([]); setSearched(true); });
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="space-y-3">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'EXISTING', label: t('reception.tabExisting'), icon: <Search className="h-4 w-4 shrink-0" /> },
          { value: 'NEW', label: t('reception.tabNew'), icon: <UserPlus className="h-4 w-4 shrink-0" /> },
        ]}
      />

      {tab === 'EXISTING' ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
            <input
              className="field ps-10"
              placeholder={t('familyCard.searchPatient')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
          </div>

          {results.length > 0 && (
            <ul className="space-y-0.5 rounded-xl border border-line p-1">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onPick(p)}
                    className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-surface-2"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-muted">
                      {p.fullName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-body">{p.fullName}</span>
                      <span className="block truncate text-xs text-subtle">
                        {p.mrNo}{p.mobile ? ` · ${p.mobile}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-subtle group-hover:text-body rtl:rotate-180" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* A search that found nobody is exactly when registering is the
              right next step, so offer it rather than leaving a dead end. */}
          {searched && results.length === 0 && (
            <p className="text-sm text-muted">
              {t('familyCard.noPatientMatch')}{' '}
              <button
                onClick={() => setTab('NEW')}
                className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
              >
                {t('reception.tabNew')}
              </button>
            </p>
          )}
        </>
      ) : (
        /* A number searched for and not found is almost always the new
           person's own — carry it over rather than asking twice. */
        <AddPatientForm
          framed={false}
          initialMobile={/^0\d{0,10}$/u.test(q.trim()) ? q.trim() : ''}
          onCancel={() => setTab('EXISTING')}
          onCreated={onPick}
        />
      )}
    </div>
  );
}

/** The person chosen for a step, with a way back out. */
function PickedPatient({
  patient, actionLabel, onClear,
}: { patient: PatientDTO; actionLabel: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-500/8 p-3.5 ring-1 ring-brand-500/20">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
          {patient.fullName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-strong">{patient.fullName}</span>
          <span className="block truncate text-sm text-muted">
            {patient.mrNo}{patient.mobile ? ` · ${patient.mobile}` : ''}
          </span>
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>{actionLabel}</Button>
    </div>
  );
}

/** A mobile number input, with the icon that says what goes in it. */
function MobileInput({
  id, value, onChange, placeholder, autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Phone className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
      <input
        id={id}
        className="field ps-10 font-mono tabular-nums"
        inputMode="tel"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
      />
    </div>
  );
}

/** Why a person is on a card: asked before they are added, then permanent. */
function RelationStep({
  holderName, relation, onRelation, error, busy, onAdd,
}: {
  holderName: string;
  relation: Relation;
  onRelation: (r: Relation) => void;
  error: string | null;
  busy: boolean;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div>
        <span className="label">{t('reception.relationTo').replace('{name}', holderName)}</span>
        <Select
          value={relation}
          onChange={(v) => onRelation(v as Relation)}
          options={MEMBER_RELATIONS.map((r) => ({ value: r, label: t(`relation.${r}`) }))}
        />
      </div>
      <p className="note-warn flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {t('familyCard.permanent')}
      </p>
      {error && <p className="note-danger"><Tr text={error} /></p>}
      <Button className="w-full" size="lg" loading={busy} onClick={onAdd}>
        <UserPlus className="h-4 w-4" /> {t('familyCard.add')}
      </Button>
    </>
  );
}

/**
 * Add a person to a card that already exists, starting from the number.
 *
 * Mirrors the booking screen step for step — number, then who, then how they
 * relate — because staff meet the same request at both counters and should not
 * have to learn it twice.
 */
function JoinCard({
  onCancel, onJoined,
}: { onCancel: () => void; onJoined: (mobile: string) => void }) {
  const { t } = useI18n();
  const [mobile, setMobile] = useState('');
  const [card, setCard] = useState<FamilyCardDTO | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState<PatientDTO | null>(null);
  const [relation, setRelation] = useState<Relation>('OTHER');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      if (!/^0\d{10}$/u.test(mobile.trim())) { setCard(null); setSearched(false); return; }
      findCardByMobileAction(mobile.trim())
        .then((c) => { setCard(c); setSearched(true); })
        .catch(() => { setCard(null); setSearched(true); });
    }, 300);
    return () => clearTimeout(id);
  }, [mobile]);

  function add() {
    if (!card || !pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addCardMemberAction(card.id, pending.id, relation);
      if (res.ok) onJoined(card.mobile);
      else setError(res.error);
    });
  }

  return (
    <div className="page">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{t('reception.cardJoin')}</h1>
      </div>

      <Card className="space-y-5 p-5">
        <div>
          <label className="label" htmlFor="join-mobile">{t('reception.cardOnNumber')}</label>
          <MobileInput
            id="join-mobile"
            value={mobile}
            onChange={setMobile}
            placeholder={t('reception.cardJoinPlaceholder')}
            autoFocus
          />
          {searched && !card && (
            <p className="note-danger mt-2.5">{t('reception.cardNotFound')}</p>
          )}
          {card && <FoundCard card={card} />}
        </div>

        {card && card.slotsLeft === 0 && <p className="note-warn">{t('familyCard.full')}</p>}

        {card && card.slotsLeft > 0 && (
          <div className="space-y-3">
            <span className="label">{t('familyCard.addMember')}</span>
            {pending ? (
              <>
                <PickedPatient patient={pending} actionLabel={t('common.change')} onClear={() => setPending(null)} />
                <RelationStep
                  holderName={card.primaryName}
                  relation={relation}
                  onRelation={setRelation}
                  error={error}
                  busy={isPending}
                  onAdd={add}
                />
              </>
            ) : (
              <PatientPicker onPick={setPending} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/** The card a typed number led to, confirmed at a glance. */
function FoundCard({ card }: { card: FamilyCardDTO }) {
  const { t } = useI18n();
  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-ok-line bg-ok-soft px-3.5 py-3 text-ok-text">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ok-text/10">
        <Check className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{card.primaryName}</span>
        <span className="block text-xs opacity-80 tabular-nums">
          {card.members.length}/{card.memberCap} {t('familyCard.slotsUsed')}
        </span>
      </span>
      <span className="text-sm font-bold tabular-nums">
        {t('familyCard.off').replace('{pct}', String(card.discountPct))}
      </span>
    </div>
  );
}

/** Issue a card: choose the holder, confirm the number, see the fee. */
function NewCard({
  policy, onCancel, onCreated,
}: {
  policy: { fee: number; discountPct: number };
  onCancel: () => void;
  onCreated: (mobile: string) => void;
}) {
  const { t } = useI18n();
  const [holder, setHolder] = useState<PatientDTO | null>(null);
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create() {
    if (!holder) return;
    setError(null);
    startTransition(async () => {
      const res = await issueCardAction(mobile, holder.id);
      if (res.ok) onCreated(mobile);
      else setError(res.error);
    });
  }

  return (
    <div className="page">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{t('familyCard.new')}</h1>
      </div>

      <Card className="space-y-5 p-5">
        <div className="space-y-3">
          <span className="label">{t('familyCard.holder')}</span>
          {holder ? (
            <PickedPatient
              patient={holder}
              actionLabel={t('common.change')}
              onClear={() => { setHolder(null); setMobile(''); }}
            />
          ) : (
            // A first-time visitor may want nothing but a card, so registering
            // them has to be possible here, not only at booking.
            <PatientPicker
              onPick={(p) => {
                setHolder(p);
                // The holder's own number is the card almost always.
                setMobile(p.mobile ?? '');
              }}
            />
          )}
        </div>

        {holder && (
          <>
            <div>
              <label className="label" htmlFor="new-card-mobile">{t('reception.cardOnNumber')}</label>
              <MobileInput id="new-card-mobile" value={mobile} onChange={setMobile} placeholder="03001234567" />
              <p className="mt-1.5 text-xs text-muted">{t('familyCard.mobileHint')}</p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-3 text-sm text-warn-text">
              <span>{t('familyCard.feeNotice')}</span>
              <span className="text-base font-bold tabular-nums">{formatPkr(policy.fee)}</span>
            </div>

            {error && <p className="note-danger"><Tr text={error} /></p>}

            <Button
              className="w-full"
              size="lg"
              loading={isPending}
              disabled={!/^0\d{10}$/u.test(mobile.trim())}
              onClick={create}
            >
              <Plus className="h-4 w-4" /> {t('familyCard.issueFor')}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

/** One card: its members, and adding to it. */
function CardDetail({
  card, onBack, onChanged,
}: { card: FamilyCardDTO; onBack: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<PatientDTO | null>(null);
  const [relation, setRelation] = useState<Relation>('OTHER');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addCardMemberAction(card.id, pending.id, relation);
      if (res.ok) {
        setPending(null);
        setRelation('OTHER');
        onChanged();
      } else setError(res.error);
    });
  }

  return (
    <div className="page">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button>
        <h1 className="font-mono text-xl font-extrabold tracking-tight text-strong">{card.mobile}</h1>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-base font-bold text-white">
              {card.primaryName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-xs text-muted">{t('familyCard.holder')}</div>
              <div className="truncate font-semibold text-strong">{card.primaryName}</div>
              <SlotsBar used={card.members.length} cap={card.memberCap} label={t('familyCard.slotsUsed')} />
            </div>
          </div>
          <div className="shrink-0 rounded-xl bg-brand-500/8 px-4 py-2 text-end ring-1 ring-brand-500/20">
            <div className="text-2xl font-extrabold text-brand-600 tabular-nums dark:text-brand-300">
              {card.discountPct}%
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t('familyCard.rate')}</div>
          </div>
        </div>

        <SectionHeading className="mt-5" accent={ACCENT.brand} count={card.members.length}>
          {t('familyCard.members')}
        </SectionHeading>
        <RailGroup accent={ACCENT.brand}>
          <ul className="space-y-0.5">
            {card.members.map((m) => (
              <li
                key={m.memberId}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-body">{m.fullName}</span>
                  <span className="block font-mono text-xs text-subtle">{m.mrNo}</span>
                </span>
                <Badge tone={m.isPrimary ? 'info' : 'neutral'} size="sm">
                  {t(`relation.${m.isPrimary ? 'SELF' : m.relation}`)}
                </Badge>
              </li>
            ))}
          </ul>
        </RailGroup>
      </Card>

      {card.slotsLeft > 0 ? (
        <Card className="space-y-3 p-5">
          <span className="label flex items-center gap-1.5">
            <UserPlus className="h-4 w-4" /> {t('familyCard.addMember')}
          </span>
          {pending ? (
            // Chosen, but not yet added: the relation is asked before the row
            // is written, so no membership exists without one.
            <>
              <PickedPatient patient={pending} actionLabel={t('common.cancel')} onClear={() => setPending(null)} />
              <RelationStep
                holderName={card.primaryName}
                relation={relation}
                onRelation={setRelation}
                error={error}
                busy={isPending}
                onAdd={add}
              />
            </>
          ) : (
            // A family member may never have visited the lab; registering them
            // here avoids booking a test nobody asked for.
            <PatientPicker onPick={setPending} />
          )}
        </Card>
      ) : (
        <p className="note-warn">{t('familyCard.full')}</p>
      )}
    </div>
  );
}
