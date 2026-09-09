'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { CreditCard, UserPlus, Plus, Search, ArrowLeft, Users, Check, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

/**
 * The card register, not a lookup box.
 *
 * The previous screen had one action — type a number, press Look up — so the
 * only way to reach "create a card" was to search for one that did not exist
 * and read the fallback. Existing cards were invisible, even though the
 * service could already list them.
 *
 * Now: cards are listed, search narrows the list, and issuing one is an
 * explicit button.
 */
export function FamilyCardsClient() {
  const { t } = useI18n();
  const [view, setView] = useState<'LIST' | 'NEW' | 'JOIN'>('LIST');
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<CardSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCard, setOpenCard] = useState<FamilyCardDTO | null>(null);
  const [policy, setPolicy] = useState({ fee: 0, discountPct: 0, discountOnIssue: true });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadList = useCallback((q?: string) => {
    setLoading(true);
    listCardsAction(q).then(setCards).catch(() => setCards([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getCardPolicyAction().then(setPolicy).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(() => loadList(query || undefined), 250);
    return () => clearTimeout(id);
  }, [query, loadList]);

  const openDetail = useCallback((mobile: string) => {
    findCardByMobileAction(mobile).then(setOpenCard).catch(() => setOpenCard(null));
  }, []);

  function refreshDetail() {
    if (openCard) openDetail(openCard.mobile);
    loadList(query || undefined);
  }

  // ── Detail ──────────────────────────────────────────────
  if (openCard) {
    return (
      <CardDetail
        card={openCard}
        onBack={() => { setOpenCard(null); loadList(query || undefined); }}
        onChanged={refreshDetail}
      />
    );
  }

  // ── Add someone to an existing card ─────────────────────
  if (view === 'JOIN') {
    return (
      <JoinCard
        onCancel={() => setView('LIST')}
        onJoined={(mobile) => { setView('LIST'); loadList(); openDetail(mobile); }}
      />
    );
  }

  // ── New card ────────────────────────────────────────────
  if (view === 'NEW') {
    return (
      <NewCard
        policy={policy}
        onCancel={() => setView('LIST')}
        onCreated={(mobile) => { setView('LIST'); loadList(); openDetail(mobile); }}
      />
    );
  }

  // ── Register ────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-strong">
            <CreditCard className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            {t('familyCard.title')}
          </h1>
          <p className="text-sm text-muted">
            {t('familyCard.subtitle')
              .replace('{pct}', String(policy.discountPct))
              .replace('{cap}', String(policy.discountOnIssue ? policy.fee : policy.fee))}
          </p>
        </div>
        {/* The same two actions as the booking screen, in the same words and
            the same order, so staff learn one model rather than two. */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView('JOIN')}>
            <UserPlus className="h-4 w-4" /> {t('reception.cardJoin')}
          </Button>
          <Button onClick={() => setView('NEW')}>
            <Plus className="h-4 w-4" /> {t('reception.cardCreate')}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 h-4 w-4 text-subtle" />
        <input
          className="field ps-10"
          placeholder={t('familyCard.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="note-danger">{error}</p>}

      {loading ? (
        <Card className="p-6 text-center text-sm text-subtle">{t('common.loading')}</Card>
      ) : cards.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle">
            <CreditCard className="h-6 w-6" />
          </span>
          <p className="text-muted">{query ? t('familyCard.noMatches') : t('familyCard.noCards')}</p>
          {!query && (
            <Button onClick={() => setView('NEW')}>
              <Plus className="h-4 w-4" /> {t('reception.cardCreate')}
            </Button>
          )}
        </Card>
      ) : (
        <Card className="p-2">
          <ul className="space-y-0.5">
            {cards.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => openDetail(c.mobile)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-surface-2"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-600 dark:text-brand-300">
                    {c.holderName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-strong">
                      {c.holderName}
                      {!c.isActive && (
                        <span className="ms-2 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                          {t('familyCard.inactive')}
                        </span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-xs text-subtle">{c.mobile}</span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-bold text-strong tabular-nums">{c.discountPct}%</span>
                    <span className="flex items-center gap-1 text-xs text-subtle tabular-nums">
                      <Users className="h-3 w-3" /> {c.used}/{c.cap}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * Add a person to a card that already exists, starting from the number.
 *
 * Mirrors the booking screen step for step — number, then who, then how they
 * relate — because staff meet the same request at both counters and should not
 * have to learn it twice. Previously this screen made you find the card in a
 * list first, which is a different mental model for the same job.
 */
function JoinCard({
  onCancel, onJoined,
}: { onCancel: () => void; onJoined: (mobile: string) => void }) {
  const { t } = useI18n();
  const [mobile, setMobile] = useState('');
  const [card, setCard] = useState<FamilyCardDTO | null>(null);
  const [searched, setSearched] = useState(false);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientDTO[]>([]);
  const [addingPatient, setAddingPatient] = useState(false);
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

  useEffect(() => {
    const id = setTimeout(() => {
      if (q.trim().length < 2) { setResults([]); return; }
      searchPatientsAction(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

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
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{t('reception.cardJoin')}</h1>
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <span className="label">{t('reception.cardOnNumber')}</span>
          <input
            className="field"
            inputMode="tel"
            placeholder={t('reception.cardJoinPlaceholder')}
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoFocus
          />
          {searched && !card && (
            <p className="mt-1.5 text-sm text-danger-text">{t('reception.cardNotFound')}</p>
          )}
          {card && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ok-text">
              <Check className="h-4 w-4" />
              <span className="font-semibold">{card.primaryName}</span>
              <span>· {card.discountPct}%</span>
              <span className="text-subtle">
                · {card.members.length}/{card.memberCap} {t('familyCard.slotsUsed')}
              </span>
            </p>
          )}
        </div>

        {card && card.slotsLeft === 0 && <p className="note-warn">{t('familyCard.full')}</p>}

        {card && card.slotsLeft > 0 && (
          <div>
            <span className="label">{t('familyCard.addMember')}</span>
            {addingPatient ? (
              <AddPatientForm
                onCancel={() => setAddingPatient(false)}
                onCreated={(p) => { setPending(p); setAddingPatient(false); setQ(''); setResults([]); }}
              />
            ) : pending ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-strong">{pending.fullName}</span>
                    <span className="block truncate text-xs text-subtle">{pending.mrNo}</span>
                  </span>
                  <Button variant="ghost" onClick={() => setPending(null)}>{t('common.change')}</Button>
                </div>
                <div>
                  <span className="label">
                    {t('reception.relationTo').replace('{name}', card.primaryName)}
                  </span>
                  <Select
                    value={relation}
                    onChange={(v) => setRelation(v as Relation)}
                    options={MEMBER_RELATIONS.map((r) => ({ value: r, label: t(`relation.${r}`) }))}
                  />
                </div>
                <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-text">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t('familyCard.permanent')}
                </p>
                {error && <p className="note-danger">{error}</p>}
                <Button className="w-full" size="lg" loading={isPending} onClick={add}>
                  <UserPlus className="h-4 w-4" /> {t('familyCard.add')}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    className="field"
                    placeholder={t('familyCard.searchPatient')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <Button variant="outline" onClick={() => setAddingPatient(true)}>
                    <UserPlus className="h-4 w-4" /> {t('familyCard.newPatient')}
                  </Button>
                </div>
                {results.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => setPending(p)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-surface-2"
                        >
                          <span className="truncate text-sm font-medium text-body">{p.fullName}</span>
                          <span className="shrink-0 text-xs text-subtle">{p.mrNo}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {q.trim().length >= 2 && results.length === 0 && (
                  <p className="mt-2 text-sm text-muted">
                    {t('familyCard.noPatientMatch')}{' '}
                    <button
                      onClick={() => setAddingPatient(true)}
                      className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                    >
                      {t('familyCard.newPatient')}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Card>
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
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientDTO[]>([]);
  const [holder, setHolder] = useState<PatientDTO | null>(null);
  const [mobile, setMobile] = useState('');
  // A first-time visitor may want nothing but a card. Registering them has to
  // be possible here, or the only way in is to book a test they do not want.
  const [addingPatient, setAddingPatient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      if (q.trim().length < 2) { setResults([]); return; }
      searchPatientsAction(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

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
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{t('familyCard.new')}</h1>
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <span className="label">{t('familyCard.holder')}</span>
          {holder ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-strong">{holder.fullName}</span>
                <span className="block truncate text-xs text-subtle">
                  {holder.mrNo}{holder.mobile ? ` · ${holder.mobile}` : ''}
                </span>
              </span>
              <Button variant="ghost" onClick={() => { setHolder(null); setMobile(''); }}>
                {t('common.change')}
              </Button>
            </div>
          ) : addingPatient ? (
            <AddPatientForm
              initialMobile={/^0\d{0,10}$/u.test(q.trim()) ? q.trim() : ''}
              onCancel={() => setAddingPatient(false)}
              onCreated={(p) => {
                setHolder(p);
                setMobile(p.mobile ?? '');
                setAddingPatient(false);
                setResults([]);
              }}
            />
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className="field"
                  placeholder={t('familyCard.searchPatient')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <Button variant="outline" onClick={() => setAddingPatient(true)}>
                  <UserPlus className="h-4 w-4" /> {t('familyCard.newPatient')}
                </Button>
              </div>

              {results.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => {
                          setHolder(p);
                          // The holder's own number is the card almost always.
                          setMobile(p.mobile ?? '');
                          setResults([]);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-surface-2"
                      >
                        <span className="truncate text-sm font-medium text-body">{p.fullName}</span>
                        <span className="shrink-0 text-xs text-subtle">
                          {p.mrNo}{p.mobile ? ` · ${p.mobile}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* A search that found nobody is exactly when registering is the
                  right next step, so say so rather than leaving a dead end. */}
              {q.trim().length >= 2 && results.length === 0 && (
                <p className="mt-2 text-sm text-muted">
                  {t('familyCard.noPatientMatch')}{' '}
                  <button
                    onClick={() => setAddingPatient(true)}
                    className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                  >
                    {t('familyCard.newPatient')}
                  </button>
                </p>
              )}
            </>
          )}
        </div>

        {holder && (
          <>
            <div>
              <span className="label">{t('reception.cardOnNumber')}</span>
              <input
                className="field"
                inputMode="tel"
                placeholder="03001234567"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
              <p className="mt-1 text-xs text-subtle">{t('familyCard.mobileHint')}</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2.5 text-sm text-warn-text">
              <span>{t('familyCard.feeNotice')}</span>
              <span className="font-bold tabular-nums">{formatPkr(policy.fee)}</span>
            </div>

            {error && <p className="note-danger">{error}</p>}

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

/** One card: its members, and adding or removing them. */
function CardDetail({
  card, onBack, onChanged,
}: { card: FamilyCardDTO; onBack: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientDTO[]>([]);
  const [pending, setPending] = useState<PatientDTO | null>(null);
  const [relation, setRelation] = useState<Relation>('OTHER');
  // A family member may never have visited the lab. Requiring them to exist as
  // a patient first would mean booking a test nobody asked for.
  const [addingPatient, setAddingPatient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      if (q.trim().length < 2) { setResults([]); return; }
      searchPatientsAction(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  function add() {
    if (!pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addCardMemberAction(card.id, pending.id, relation);
      if (res.ok) {
        setQ(''); setResults([]); setPending(null); setRelation('OTHER');
        setAddingPatient(false);
        onChanged();
      } else setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-extrabold tracking-tight text-strong">{card.mobile}</h1>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm text-muted">
              {t('familyCard.holder')}: <span className="font-semibold text-strong">{card.primaryName}</span>
            </div>
            <div className="text-xs text-subtle tabular-nums">
              {card.members.length}/{card.memberCap} {t('familyCard.slotsUsed')}
            </div>
          </div>
          <div className="text-end">
            <div className="text-2xl font-extrabold text-brand-600 tabular-nums dark:text-brand-300">
              {card.discountPct}%
            </div>
            <div className="text-[10px] uppercase tracking-wide text-subtle">{t('familyCard.rate')}</div>
          </div>
        </div>

        <SectionHeading className="mt-4" accent={ACCENT.brand} count={card.members.length}>
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
                <span className="block truncate text-sm font-medium text-body">
                  {m.fullName}
                  <span
                    className={cn(
                      'ms-2 rounded px-1.5 py-0.5 text-[10px] font-bold',
                      m.isPrimary
                        ? 'bg-brand-500/12 text-brand-600 dark:text-brand-300'
                        : 'bg-surface-3 text-muted',
                    )}
                  >
                    {t(`relation.${m.isPrimary ? 'SELF' : m.relation}`)}
                  </span>
                </span>
                <span className="block font-mono text-xs text-subtle">{m.mrNo}</span>
              </span>

              </li>
            ))}
          </ul>
        </RailGroup>
      </Card>

      {error && <p className="note-danger">{error}</p>}

      {card.slotsLeft > 0 ? (
        <Card className="p-4">
          <span className="label flex items-center gap-1.5">
            <UserPlus className="h-4 w-4" /> {t('familyCard.addMember')}
          </span>
          {addingPatient ? (
            <AddPatientForm
              initialMobile={/^0\d{0,10}$/u.test(q.trim()) ? q.trim() : ''}
              onCancel={() => setAddingPatient(false)}
              onCreated={(p) => {
                // Straight into the relation step: a new member still needs to
                // say who they are to the holder.
                setPending(p);
                setAddingPatient(false);
                setQ('');
                setResults([]);
              }}
            />
          ) : pending ? (
            // Chosen, but not yet added: the relation is asked before the row
            // is written, so no membership exists without one.
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-strong">{pending.fullName}</span>
                  <span className="block truncate text-xs text-subtle">{pending.mrNo}</span>
                </span>
                <Button variant="ghost" onClick={() => setPending(null)}>{t('common.cancel')}</Button>
              </div>
              <div>
                <span className="label">
                  {t('reception.relationTo').replace('{name}', card.primaryName)}
                </span>
                <Select
                  value={relation}
                  onChange={(v) => setRelation(v as Relation)}
                  options={MEMBER_RELATIONS.map((r) => ({ value: r, label: t(`relation.${r}`) }))}
                />
              </div>
              <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t('familyCard.permanent')}
              </p>
              <Button className="w-full" onClick={add}>
                <UserPlus className="h-4 w-4" /> {t('familyCard.add')}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className="field"
                  placeholder={t('familyCard.searchPatient')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <Button variant="outline" onClick={() => setAddingPatient(true)}>
                  <UserPlus className="h-4 w-4" /> {t('familyCard.newPatient')}
                </Button>
              </div>

              {results.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => setPending(p)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-surface-2"
                      >
                        <span className="truncate text-sm font-medium text-body">{p.fullName}</span>
                        <span className="shrink-0 text-xs text-subtle">{p.mrNo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {q.trim().length >= 2 && results.length === 0 && (
                <p className="mt-2 text-sm text-muted">
                  {t('familyCard.noPatientMatch')}{' '}
                  <button
                    onClick={() => setAddingPatient(true)}
                    className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                  >
                    {t('familyCard.newPatient')}
                  </button>
                </p>
              )}
            </>
          )}
        </Card>
      ) : (
        <p className="note-warn">{t('familyCard.full')}</p>
      )}
    </div>
  );
}
