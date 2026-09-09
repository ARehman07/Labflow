'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CreditCard } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import {
  describeCardForBookingAction,
  currentCardForPatientAction,
  cardOnNumberAction,
  getCardPolicyAction,
  type BookingCardInfo,
} from '@/modules/familycard/familycard.actions';
import { MEMBER_RELATIONS, type Relation } from '@/modules/familycard/familycard.rules';
import { Button } from '@/components/ui/Button';
import { AddPatientForm } from '@/components/patients/AddPatientForm';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Combobox, type ComboItem } from '@/components/ui/Combobox';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { cn, formatPkr } from '@/lib/utils';
import {
  searchPatientsAction,
  searchTestsAction,
  listDoctorsAction,
  createPatientAction,
  bookVisitAction,
  type PatientDTO,
} from '@/modules/reception/reception.actions';
import type { TestListItem } from '@/modules/catalog/catalog.service';

type CartItem = { id: string; name: string; price: number };

export function BookingClient() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientDTO[]>([]);
  const [patLoading, setPatLoading] = useState(false);
  const [selected, setSelected] = useState<PatientDTO | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<TestListItem[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENT'>('FIXED');

  // Family card. Three situations reception actually meets: the patient
  // already has one, they want to go on a relative's, or they want their own.
  const [ownCard, setOwnCard] = useState<{ discountPct: number; mobile: string } | null>(null);
  const [discountSource, setDiscountSource] = useState<'NONE' | 'MANUAL' | 'CARD'>('NONE');
  const [cardMode, setCardMode] = useState<'CREATE' | 'JOIN'>('JOIN');
  const [joinMobile, setJoinMobile] = useState('');
  const [joinRelation, setJoinRelation] = useState<Relation>('OTHER');
  // A card found on the patient's own number, or on the number reception just
  // searched — surfaced without being asked for.
  const [suggested, setSuggested] = useState<{ mobile: string; info: BookingCardInfo } | null>(null);
  const [joinInfo, setJoinInfo] = useState<BookingCardInfo | null>(null);
  // A new card is held on the patient's own number by default — that is the
  // case at the counter almost every time. It stays editable because the
  // household number is not always the one on the slip.
  const [newCardMobile, setNewCardMobile] = useState('');
  const [newCardClash, setNewCardClash] = useState<BookingCardInfo | null>(null);
  const [cardPolicy, setCardPolicy] = useState({ fee: 0, discountPct: 0, discountOnIssue: true });

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listDoctorsAction().then(setDoctors).catch(() => setDoctors([]));
    getCardPolicyAction().then(setCardPolicy).catch(() => {});
  }, []);

  // Whenever the patient changes, forget the previous patient's card entirely.
  useEffect(() => {
    setDiscountSource('NONE');
    setCardMode('JOIN');
    setDiscount(0);
    setJoinMobile('');
    setJoinRelation('OTHER');
    setJoinInfo(null);
    setSuggested(null);
    setNewCardClash(null);
    setNewCardMobile(selected?.mobile ?? '');
    if (!selected) { setOwnCard(null); return; }
    currentCardForPatientAction(selected.id).then(setOwnCard).catch(() => setOwnCard(null));

    // Two numbers are worth checking without being asked: the patient's own,
    // and whatever reception just typed to find them. Either may belong to a
    // relative's card — which is exactly the case that silently did nothing
    // before, leaving staff to guess that a card even existed.
    const candidates = [selected.mobile, patientQuery.trim()]
      .filter((m): m is string => !!m && /^0\d{10}$/u.test(m));
    (async () => {
      for (const m of [...new Set(candidates)]) {
        const info = await cardOnNumberAction(m, selected.id).catch(() => null);
        if (info?.found) { setSuggested({ mobile: m, info }); return; }
      }
      setSuggested(null);
    })();
  }, [selected, patientQuery]);

  const joinDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(joinDeb.current);
    if (discountSource !== 'CARD' || cardMode !== 'JOIN' || !selected || joinMobile.trim().length < 11) {
      setJoinInfo(null);
      return;
    }
    joinDeb.current = setTimeout(() => {
      describeCardForBookingAction(joinMobile, selected.id)
        .then(setJoinInfo).catch(() => setJoinInfo(null));
    }, 300);
    return () => clearTimeout(joinDeb.current);
  }, [joinMobile, cardMode, discountSource, selected]);

  // One card per number. If this one is taken, joining is the right action,
  // and reception should learn that before printing the slip.
  const newDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(newDeb.current);
    if (discountSource !== 'CARD' || cardMode !== 'CREATE' || !selected
        || newCardMobile.trim().length < 11) {
      setNewCardClash(null);
      return;
    }
    newDeb.current = setTimeout(() => {
      describeCardForBookingAction(newCardMobile, selected.id)
        .then((info) => setNewCardClash(info.found ? info : null))
        .catch(() => setNewCardClash(null));
    }, 300);
    return () => clearTimeout(newDeb.current);
  }, [newCardMobile, cardMode, discountSource, selected]);

  const patDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (selected) return;
    clearTimeout(patDeb.current);
    if (patientQuery.trim().length < 2) { setPatientResults([]); return; }
    setPatLoading(true);
    patDeb.current = setTimeout(() => {
      searchPatientsAction(patientQuery)
        .then(setPatientResults).catch(() => setPatientResults([]))
        .finally(() => setPatLoading(false));
    }, 250);
    return () => clearTimeout(patDeb.current);
  }, [patientQuery, selected]);

  const testDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(testDeb.current);
    if (testQuery.trim().length < 1) { setTestResults([]); return; }
    setTestLoading(true);
    testDeb.current = setTimeout(() => {
      searchTestsAction(testQuery)
        .then(setTestResults).catch(() => setTestResults([]))
        .finally(() => setTestLoading(false));
    }, 250);
    return () => clearTimeout(testDeb.current);
  }, [testQuery]);

  const total = cart.reduce((s, c) => s + c.price, 0);

  // The rate that will actually apply, mirroring resolveDiscount on the server.
  const usingCard = discountSource === 'CARD';
  const cardPct =
    ownCard?.discountPct
    ?? (usingCard && cardMode === 'JOIN' && joinInfo?.canJoin ? joinInfo.discountPct ?? 0 : 0)
    ?? 0;
  const newCardValid =
    /^0\d{10}$/u.test(newCardMobile.trim()) && !newCardClash;
  const willCreateCard = usingCard && cardMode === 'CREATE' && !ownCard && newCardValid;
  const effectivePct =
    cardPct > 0
      ? cardPct
      : willCreateCard && cardPolicy.discountOnIssue
        ? cardPolicy.discountPct
        : 0;

  const manual = discountSource === 'MANUAL' ? discount : 0;
  const discountAmount = Math.round(
    effectivePct > 0
      ? (total * effectivePct) / 100
      : discountType === 'PERCENT'
        ? (total * Math.min(manual, 100)) / 100
        : Math.min(manual, total),
  );
  const feeCharged = willCreateCard ? cardPolicy.fee : 0;
  const net = Math.max(0, total - discountAmount) + feeCharged;
  const cardApplies = effectivePct > 0;

  function book() {
    setError(null);
    if (!selected || cart.length === 0) return;
    startTransition(async () => {
      const res = await bookVisitAction({
        patientId: selected.id,
        testIds: cart.map((c) => c.id),
        doctorId: doctorId || undefined,
        discountType,
        discountValue: discountSource === 'MANUAL' ? discount : 0,
        familyCardMode: usingCard ? cardMode : 'NONE',
        familyCardRelation: joinRelation,
        familyCardMobile: usingCard
          ? (cardMode === 'JOIN' ? joinMobile : newCardMobile)
          : undefined,
      });
      if (res.ok) { toast('success', t('reception.save')); router.push(`/reception/${res.visitId}`); }
      else { setError(res.error); toast('error', res.error); }
    });
  }

  const patientItems: ComboItem[] = patientResults.map((p) => ({
    id: p.id,
    label: p.fullName,
    sublabel: [p.mrNo, p.mobile].filter(Boolean).join(' · '),
  }));
  const testItems: ComboItem[] = testResults.map((tst) => ({
    id: tst.id,
    label: tst.name,
    sublabel: tst.departmentName,
    right: formatPkr(tst.price),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('reception.title')}</h1>

      {/* Patient */}
      <Card className="p-5">
        <div className="section-title mb-3">{t('reception.patient')}</div>
        {selected ? (
          <div className="flex items-center justify-between rounded-xl bg-brand-500/8 p-3.5 ring-1 ring-brand-500/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {selected.fullName.slice(0, 1)}
              </div>
              <div>
                <div className="font-semibold text-strong">{selected.fullName}</div>
                <div className="text-sm text-muted">
                  {selected.mrNo}
                  {selected.age != null && ` · ${selected.age} ${t('common.years')}`}
                  {selected.sex && ` · ${t(`reception.${selected.sex.toLowerCase()}`)}`}
                  {selected.mobile && ` · ${selected.mobile}`}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setPatientQuery(''); }}>
              {t('reception.change')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <Combobox
                  query={patientQuery}
                  onQueryChange={setPatientQuery}
                  items={patientItems}
                  onSelect={(it) => { const p = patientResults.find((x) => x.id === it.id); if (p) { setSelected(p); setShowAdd(false); } }}
                  placeholder={t('reception.searchPatient')}
                  loading={patLoading}
                  minChars={2}
                  emptyText={t('reception.noResults')}
                  leftIcon={<Icon name="search" className="h-4 w-4" />}
                />
              </div>
              <Button variant="outline" onClick={() => setShowAdd((s) => !s)}>+ {t('reception.addNew')}</Button>
            </div>
            {showAdd && <AddPatientForm onCreated={(p) => { setSelected(p); setShowAdd(false); toast('success', p.mrNo); }} />}
          </>
        )}
      </Card>

      {/* Tests */}
      <Card className="p-5">
        <div className="section-title mb-3">{t('reception.tests')}</div>
        <Combobox
          query={testQuery}
          onQueryChange={setTestQuery}
          items={testItems}
          onSelect={(it) => {
            const tst = testResults.find((x) => x.id === it.id);
            if (tst) setCart((c) => (c.some((x) => x.id === tst.id) ? c : [...c, { id: tst.id, name: tst.name, price: tst.price }]));
            setTestQuery('');
          }}
          placeholder={t('reception.searchTest')}
          loading={testLoading}
          leftIcon={<Icon name="search" className="h-4 w-4" />}
        />

        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-muted">{t('reception.cart')}</div>
          {cart.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface-2/60 px-3 py-5 text-center text-sm text-subtle">
              {t('reception.noTests')}
            </p>
          ) : (
            <ul className="stagger space-y-0.5">
              {cart.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-surface-2">
                  <span className="font-medium text-body">{c.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-muted">{formatPkr(c.price)}</span>
                    <button
                      onClick={() => setCart((cc) => cc.filter((x) => x.id !== c.id))}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-subtle transition-colors hover:bg-danger-soft hover:text-red-600"
                      aria-label={t('common.remove')}
                    >✕</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Meta + totals */}
      <Card className="p-5">
        <div className="max-w-sm">
          <span className="label">{t('reception.doctor')}</span>
          <Select
            value={doctorId}
            onChange={setDoctorId}
            placeholder={t('common.none')}
            options={[{ value: '', label: t('common.none') }, ...doctors.map((d) => ({ value: d.id, label: d.name }))]}
          />
        </div>

        {/*
          Discount is ONE decision with three possible sources, so it is one
          control. Previously the manual amount and the family card sat in
          unrelated boxes, which hid the rule that matters: a card rate wins and
          the manual box is then ignored. Making them mutually exclusive options
          states that rule in the layout itself.
        */}
        <div className="mt-4">
          <span className="label">{t('reception.discount')}</span>

          {/* Found a card on a related number: offer it, do not make reception
              go looking for something they have no reason to suspect exists. */}
          {!ownCard && suggested?.info.found && discountSource !== 'CARD' && (
            <button
              type="button"
              onClick={() => {
                setDiscountSource('CARD');
                setCardMode('JOIN');
                setJoinMobile(suggested.mobile);
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-info-line bg-info-soft px-3.5 py-2.5 text-start text-sm text-info-text transition-opacity hover:opacity-90"
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                {suggested.info.canJoin
                  ? t('reception.cardFoundJoin')
                      .replace('{name}', suggested.info.holderName ?? '')
                      .replace('{pct}', String(suggested.info.discountPct ?? 0))
                  : t('reception.cardFoundBlocked')
                      .replace('{name}', suggested.info.holderName ?? '')}
              </span>
            </button>
          )}

          {ownCard ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ok-line bg-ok-soft px-3.5 py-2.5 text-sm text-ok-text">
              <CreditCard className="h-4 w-4 shrink-0" />
              <span className="font-semibold">{ownCard.discountPct}% {t('reception.cardApplied')}</span>
              <span className="font-mono text-xs opacity-75">{ownCard.mobile}</span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="flex" role="tablist">
                {([
                  ['NONE', t('reception.discNone')],
                  ['MANUAL', t('reception.discManual')],
                  ['CARD', t('familyCard.title')],
                ] as const).map(([mode, label]) => {
                  const on = discountSource === mode;
                  // A card is attached to a person: without one chosen there is
                  // nothing to look up, prefill, or join. Offering the option
                  // anyway only produces a failure two clicks later.
                  const blocked = mode === 'CARD' && !selected;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      disabled={blocked}
                      title={blocked ? t('reception.cardNeedsPatient') : undefined}
                      onClick={() => setDiscountSource(mode)}
                      className={cn(
                        'flex-1 border-s border-line px-3 py-2 text-sm font-semibold transition-colors first:border-s-0',
                        blocked && 'cursor-not-allowed bg-surface-2 text-subtle',
                        !blocked && on && 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
                        !blocked && !on && 'bg-surface text-muted hover:bg-surface-2 hover:text-strong',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {discountSource === 'MANUAL' && (
                <div className="p-3 pt-2.5">
                  {/* Amount and unit in one field: the unit belongs to the
                      number, so it lives inside the same box. */}
                  {/*
                    Border-only focus, deliberately unlike the global .field.
                    This control is already nested inside the tab group's box,
                    so a soft 4px halo on top of that reads as a stray shadow
                    between two borders rather than as focus. A crisp border
                    change is unambiguous at this depth.
                  */}
                  <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface ps-3.5 transition-colors focus-within:border-brand-500">
                    <input
                      type="number"
                      min={0}
                      value={discount || ''}
                      placeholder="0"
                      onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                      /* The wrapper draws the focus ring for the whole
                         control, so the input must not draw its own inside it
                         — the global *:focus-visible rule would otherwise
                         paint a second ring within the first. */
                      className="w-full border-0 bg-transparent py-2.5 text-body outline-none placeholder:text-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <div className="flex shrink-0 gap-0.5 p-1">
                      {(['FIXED', 'PERCENT'] as const).map((dt) => (
                        <button
                          key={dt}
                          type="button"
                          onClick={() => setDiscountType(dt)}
                          className={cn(
                            'h-7 w-9 rounded-lg text-sm font-bold transition-colors',
                            discountType === dt
                              ? 'bg-brand-600 text-white'
                              : 'text-subtle hover:bg-surface-3 hover:text-body',
                          )}
                        >
                          {dt === 'FIXED' ? 'Rs' : '%'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {discountSource === 'CARD' && (
                <div className="space-y-2.5 p-3 pt-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ['JOIN', t('reception.cardJoin')],
                      ['CREATE', t('reception.cardCreate')],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setCardMode(mode)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
                          cardMode === mode
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-line bg-surface text-muted hover:text-strong',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {cardMode === 'JOIN' && (
                    <div>
                      <input
                        className="field"
                        inputMode="tel"
                        placeholder={t('reception.cardJoinPlaceholder')}
                        value={joinMobile}
                        onChange={(e) => setJoinMobile(e.target.value)}
                      />
                      {joinInfo && (
                        joinInfo.found && joinInfo.canJoin ? (
                          <>
                            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ok-text">
                              <Check className="h-4 w-4" />
                              <span className="font-semibold">{joinInfo.holderName}</span>
                              <span>· {joinInfo.discountPct}%</span>
                              <span className="text-subtle">
                                · {joinInfo.used}/{joinInfo.cap} {t('familyCard.slotsUsed')}
                              </span>
                            </p>
                            {/* Who they are to the holder is what justifies the
                                discount, so it is asked at the moment of joining
                                rather than left blank forever. */}
                            <div className="mt-2">
                              <span className="label">
                                {t('reception.relationTo').replace('{name}', joinInfo.holderName ?? '')}
                              </span>
                              <Select
                                value={joinRelation}
                                onChange={(v) => setJoinRelation(v as Relation)}
                                options={MEMBER_RELATIONS.map((r) => ({
                                  value: r,
                                  label: t(`relation.${r}`),
                                }))}
                              />
                            </div>
                          </>
                        ) : (
                          <p className="mt-1.5 text-sm text-danger-text">
                            {joinInfo.reason ?? t('reception.cardNotFound')}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  {cardMode === 'CREATE' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">
                        {t('reception.cardOnNumber')}
                      </label>
                      <input
                        className="field"
                        inputMode="tel"
                        placeholder="03001234567"
                        value={newCardMobile}
                        onChange={(e) => setNewCardMobile(e.target.value)}
                      />
                      {newCardClash ? (
                        <p className="mt-1.5 text-sm text-danger-text">
                          {t('reception.cardNumberTaken').replace('{name}', newCardClash.holderName ?? '')}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-sm text-muted">
                          {t('reception.cardCreateNote')
                            .replace('{fee}', formatPkr(cardPolicy.fee))
                            .replace('{pct}', String(cardPolicy.discountPct))}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 space-y-1.5 rounded-xl bg-surface-2 p-4 text-sm">
          <div className="flex justify-between text-muted"><span>{t('reception.total')}</span><span>{formatPkr(total)}</span></div>
          <div className="flex justify-between text-muted">
            <span>
              {cardApplies
                ? `${t('familyCard.title')} (${effectivePct}%)`
                : `${t('reception.discount')}${discountType === 'PERCENT' && manual > 0 ? ` (${manual}%)` : ''}`}
            </span>
            <span>− {formatPkr(discountAmount)}</span>
          </div>
          {feeCharged > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('reception.cardFee')}</span>
              <span>+ {formatPkr(feeCharged)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-lg font-extrabold text-strong">
            <span>{t('reception.net')}</span><span className="text-brand-600 dark:text-brand-300">{formatPkr(net)}</span>
          </div>
        </div>

        {error && <p className="mt-3 animate-fade-in rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}

        <Button size="lg" className="mt-4 w-full" onClick={book} loading={isPending} disabled={!selected || cart.length === 0}>
          <Icon name="print" className="h-4 w-4" /> {t('reception.save')}
        </Button>
      </Card>
    </div>
  );
}

