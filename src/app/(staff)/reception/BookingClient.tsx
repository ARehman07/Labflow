'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgePercent, CalendarClock, Check, CircleAlert, CreditCard, Keyboard, MessageSquareText, Package, Plus, RotateCcw, Search, StickyNote, UserPlus, Users } from 'lucide-react';
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
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { cn, formatPkr } from '@/lib/utils';
import {
  searchPatientsAction,
  searchTestsAction,
  listDoctorsAction,
  createPatientAction,
  bookVisitAction,
  lastVisitTestsAction,
  popularTestsAction,
  patientDuesAction,
  priceTestsAction,
  quickAddDoctorAction,
  type PatientDTO,
  type QuickTest,
} from '@/modules/reception/reception.actions';
import type { TestListItem } from '@/modules/catalog/catalog.service';
import { getPatientForBookingAction } from '@/modules/patients/patients.actions';
import { listPaymentAccountsAction, type PaymentAccountDTO } from '@/modules/accounts/accounts.actions';
import { listInwardPartnersAction } from '@/modules/partners/partners.actions';
import {
  listPackagesAction,
  listRateGroupsAction,
  listCollectionPointsAction,
  type PackageDTO,
  type RateGroupDTO,
  type CollectionPointDTO,
} from '@/modules/pricing/pricing.actions';
import { Tr } from '@/components/ui/Tr';

type CartItem = { id: string; name: string; price: number };

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));

const kbd = 'rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-body';

export function BookingClient() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientDTO[]>([]);
  const [patLoading, setPatLoading] = useState(false);
  const [selected, setSelected] = useState<PatientDTO | null>(null);
  // Search and registration used to sit side by side, a box and a button, with
  // nothing saying which one you were meant to use. Two tabs ask the only
  // question that matters at the counter: has this person been here before?
  const [patientTab, setPatientTab] = useState<'EXISTING' | 'NEW'>('EXISTING');

  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<TestListItem[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Packages sold at one price; their tests come with them.
  const [packages, setPackages] = useState<PackageDTO[]>([]);
  const [cartPackages, setCartPackages] = useState<PackageDTO[]>([]);
  // The price list this booking is charged from, and where it was booked.
  const [rateGroups, setRateGroups] = useState<RateGroupDTO[]>([]);
  const [collectionPoints, setCollectionPoints] = useState<CollectionPointDTO[]>([]);
  const [rateGroupId, setRateGroupId] = useState('');
  const [collectionPointId, setCollectionPointId] = useState('');
  // A partner lab that sent this patient, and its own number for the sample.
  const [partners, setPartners] = useState<{ id: string; name: string; accountType: string; rateGroupId: string | null }[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [b2bNo, setB2bNo] = useState('');

  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [doctorId, setDoctorId] = useState('');
  // Whether ANY discount applies is its own yes/no decision, asked once. Which
  // KIND it is only matters after that — so the sources no longer sit in the
  // billing panel permanently, competing with an ever-present "None".
  const [discountOn, setDiscountOn] = useState(false);
  // A manual discount is typed as rupees or a percentage. Why it was given
  // goes in the comments, which travel with the visit.
  const [manualType, setManualType] = useState<'FIXED' | 'PERCENT'>('FIXED');
  const [manualValue, setManualValue] = useState('');
  const [notes, setNotes] = useState('');

  // Payment at the counter. On by default because most walk-ins pay as they
  // book; "Pay later" leaves the invoice due for Billing. The amount follows
  // the bill until someone types a different figure (a larger note, a part
  // payment), and then stays as typed.
  const [payNow, setPayNow] = useState<'NOW' | 'LATER'>('NOW');
  // Money goes into a named till or account (Cash, JazzCash, a bank); its type
  // decides whether change is given.
  const [accounts, setAccounts] = useState<PaymentAccountDTO[]>([]);
  const [accountId, setAccountId] = useState('');
  const payMethod = accounts.find((a) => a.id === accountId)?.method ?? 'CASH';

  // Where the sample is taken, and when the report is promised. Empty means
  // "the slowest test's turnaround", worked out on the server.
  const [sampleSource, setSampleSource] = useState<'INSIDE_LAB' | 'OUTSIDE_LAB' | 'HOME' | 'EXISTING'>('INSIDE_LAB');
  const [reportDue, setReportDue] = useState('');
  // An instruction for a single test ("fasting since 10 pm"), keyed by test id.
  const [testRemarks, setTestRemarks] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  // What a returning patient still owes from earlier visits.
  const [dues, setDues] = useState<{ total: number; invoices: { invoiceId: string; slipNo: string; due: number }[] } | null>(null);
  const [received, setReceived] = useState('');
  const [receivedTouched, setReceivedTouched] = useState(false);

  // Family card. Three situations reception actually meets: the patient
  // already has one, they want to go on a relative's, or they want their own.
  const [ownCard, setOwnCard] = useState<{ discountPct: number; mobile: string } | null>(null);
  const [discountSource, setDiscountSource] = useState<'CARD' | 'MANUAL'>('CARD');
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

  // Speed at the counter. Most bookings repeat something: this patient's last
  // tests, or one of the handful the lab books all day. Both are one tap away
  // instead of a search each.
  const [lastVisit, setLastVisit] = useState<{ bookedAt: string; tests: QuickTest[] } | null>(null);
  const [popular, setPopular] = useState<QuickTest[]>([]);
  const patientBox = useRef<HTMLDivElement>(null);
  const testBox = useRef<HTMLDivElement>(null);

  // A doctor not on the list used to mean leaving the booking for Admin.
  const [addingDoctor, setAddingDoctor] = useState(false);
  const [docName, setDocName] = useState('');
  const [docClinic, setDocClinic] = useState('');
  const [docError, setDocError] = useState<string | null>(null);
  const [docSaving, startDocSave] = useTransition();

  // "New booking" from a patient's history arrives as ?patient=ID, so the
  // receptionist does not search again for someone they were just looking at.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('patient');
    if (id) getPatientForBookingAction(id).then((p) => { if (p) setSelected(p); }).catch(() => {});
  }, []);

  useEffect(() => {
    popularTestsAction().then(setPopular).catch(() => setPopular([]));
    listPackagesAction().then(setPackages).catch(() => setPackages([]));
    listRateGroupsAction().then(setRateGroups).catch(() => setRateGroups([]));
    listCollectionPointsAction().then(setCollectionPoints).catch(() => setCollectionPoints([]));
    listInwardPartnersAction().then(setPartners).catch(() => setPartners([]));
    listPaymentAccountsAction()
      .then((a) => { setAccounts(a); setAccountId((cur) => cur || a[0]?.id || ''); })
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (!selected) { setLastVisit(null); setDues(null); return; }
    lastVisitTestsAction(selected.id).then(setLastVisit).catch(() => setLastVisit(null));
    patientDuesAction(selected.id).then(setDues).catch(() => setDues(null));
  }, [selected]);

  useEffect(() => {
    listDoctorsAction().then(setDoctors).catch(() => setDoctors([]));
    getCardPolicyAction().then(setCardPolicy).catch(() => {});
  }, []);

  // Whenever the patient changes, forget the previous patient's card entirely.
  useEffect(() => {
    setDiscountOn(false);
    setDiscountSource('CARD');
    setCardMode('JOIN');
    setManualValue('');
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
    if (!discountOn || discountSource !== 'CARD' || cardMode !== 'JOIN' || !selected
        || joinMobile.trim().length < 11) {
      setJoinInfo(null);
      return;
    }
    joinDeb.current = setTimeout(() => {
      describeCardForBookingAction(joinMobile, selected.id)
        .then(setJoinInfo).catch(() => setJoinInfo(null));
    }, 300);
    return () => clearTimeout(joinDeb.current);
  }, [joinMobile, cardMode, discountSource, discountOn, selected]);

  // One card per number. If this one is taken, joining is the right action,
  // and reception should learn that before printing the slip.
  const newDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(newDeb.current);
    if (!discountOn || discountSource !== 'CARD' || cardMode !== 'CREATE' || !selected
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
  }, [newCardMobile, cardMode, discountSource, discountOn, selected]);

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
      searchTestsAction(testQuery, rateGroupId || null)
        .then(setTestResults).catch(() => setTestResults([]))
        .finally(() => setTestLoading(false));
    }, 250);
    return () => clearTimeout(testDeb.current);
  }, [testQuery, rateGroupId]);

  // Tests already inside a package in the cart are not added again on their own.
  const packagedTestIds = new Set(cartPackages.flatMap((p) => p.tests.map((x) => x.id)));
  const total = cart.reduce((s, c) => s + c.price, 0) + cartPackages.reduce((s, p) => s + p.price, 0);
  const cartEmpty = cart.length === 0 && cartPackages.length === 0;
  const partner = partners.find((x) => x.id === partnerId) ?? null;
  const billedToPartner = partner != null && partner.accountType !== 'CASH';

  // Changing the price list re-prices what is already in the cart. The server
  // prices the booking again when it is saved; this keeps the total honest.
  const cartKey = cart.map((c) => c.id).join(',');
  useEffect(() => {
    if (!cartKey) return;
    let live = true;
    priceTestsAction(cartKey.split(','), rateGroupId || null).then((prices) => {
      if (!live) return;
      setCart((c) => (c.some((x) => prices[x.id] != null && prices[x.id] !== x.price)
        ? c.map((x) => (prices[x.id] != null ? { ...x, price: prices[x.id] } : x))
        : c));
    }).catch(() => {});
    return () => { live = false; };
  }, [cartKey, rateGroupId]);

  function choosePriceList(id: string) {
    setRateGroupId(id);
    const group = rateGroups.find((g) => g.id === id);
    // A price list's default discount goes straight onto the bill as a manual
    // percentage, where it can still be changed or removed.
    if (group && group.defaultDiscountPct > 0 && !ownCard) {
      setDiscountOn(true);
      setDiscountSource('MANUAL');
      setManualType('PERCENT');
      setManualValue(String(group.defaultDiscountPct));
    }
  }

  function addPackage(id: string) {
    const pkg = packages.find((p) => p.id === id);
    if (!pkg || cartPackages.some((p) => p.id === id)) return;
    setCartPackages((ps) => [...ps, pkg]);
    setCart((c) => c.filter((x) => !pkg.tests.some((y) => y.id === x.id)));
  }

  // The rate that will actually apply, mirroring resolveDiscount on the server.
  // A card the patient already holds applies whether or not the switch is on —
  // it is theirs, not something the counter grants.
  const usingCard = discountOn && discountSource === 'CARD';
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

  // Mirrors billing/discount: a card rate wins; otherwise the typed amount or
  // percentage, never more than the tests. The server works it out again.
  const manualNum = Math.max(0, Number(manualValue) || 0);
  const manualOn = discountOn && discountSource === 'MANUAL' && manualNum > 0;
  const manualAmount = manualOn
    ? Math.round(Math.min(manualType === 'PERCENT' ? (total * Math.min(manualNum, 100)) / 100 : manualNum, total))
    : 0;

  const discountAmount = Math.round(effectivePct > 0 ? (total * effectivePct) / 100 : manualAmount);
  const feeCharged = willCreateCard ? cardPolicy.fee : 0;
  const net = Math.max(0, total - discountAmount) + feeCharged;
  const cardApplies = effectivePct > 0;

  const receivedAmount = receivedTouched ? Math.max(0, Number(received) || 0) : net;
  const changeDue = payMethod === 'CASH' ? Math.max(0, receivedAmount - net) : 0;
  const stillDue = Math.max(0, net - receivedAmount);

  const addToCart = (items: QuickTest[]) =>
    setCart((c) => [...c, ...items.filter((i) => !c.some((x) => x.id === i.id) && !packagedTestIds.has(i.id)).map(({ id, name, price }) => ({ id, name, price }))]);
  const popularShown = popular.filter((p) => !cart.some((c) => c.id === p.id));
  const lastVisitNew = lastVisit?.tests.some((x) => !cart.some((c) => c.id === x.id)) ?? false;

  function saveDoctor() {
    if (docName.trim().length < 2) return;
    setDocError(null);
    startDocSave(async () => {
      const res = await quickAddDoctorAction({ name: docName, clinic: docClinic });
      if (res.ok) {
        setDoctors((d) => (d.some((x) => x.id === res.doctor.id)
          ? d
          : [...d, res.doctor].sort((a, b) => a.name.localeCompare(b.name))));
        setDoctorId(res.doctor.id);
        setAddingDoctor(false);
        setDocName('');
        setDocClinic('');
        toast('success', t('reception.doctorAdded'));
      } else setDocError(res.error);
    });
  }

  function book() {
    setError(null);
    if (!selected || cartEmpty || isPending) return;
    startTransition(async () => {
      const res = await bookVisitAction({
        patientId: selected.id,
        testIds: cart.map((c) => c.id),
        packageIds: cartPackages.map((p) => p.id),
        rateGroupId: rateGroupId || undefined,
        collectionPointId: collectionPointId || undefined,
        partnerLabId: partnerId || undefined,
        b2bNo: partnerId ? (b2bNo.trim() || undefined) : undefined,
        doctorId: doctorId || undefined,
        manualDiscount: manualOn && effectivePct === 0
          ? { type: manualType, value: manualType === 'PERCENT' ? Math.min(manualNum, 100) : manualNum }
          : undefined,
        notes: notes.trim() || undefined,
        sampleSource,
        // A datetime-local value has no zone; send the moment it means here.
        reportDueAt: reportDue ? new Date(reportDue).toISOString() : undefined,
        testRemarks: Object.fromEntries(
          Object.entries(testRemarks).filter(([id, v]) => v.trim() && cart.some((c) => c.id === id)),
        ),
        payment: payNow === 'NOW' && receivedAmount > 0
          ? { amount: Math.min(receivedAmount, net), method: payMethod, accountId: accountId || undefined }
          : undefined,
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

  // Keyboard: the counter types more than it clicks. Alt+P and Alt+T jump to
  // the two searches; Ctrl+Enter saves. Read through a ref so the listener,
  // bound once, always calls the current booking.
  const bookRef = useRef(book);
  bookRef.current = book;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyP') {
        e.preventDefault();
        setPatientTab('EXISTING');
        setTimeout(() => patientBox.current?.querySelector('input')?.focus(), 0);
      } else if (e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        testBox.current?.querySelector('input')?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        bookRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
    <div className="page">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('reception.title')}</h1>
        <p className="hidden items-center gap-3 text-xs text-subtle lg:flex">
          <Keyboard className="h-3.5 w-3.5 self-center" aria-hidden />
          <span><kbd className={kbd}>Alt+P</kbd> {t('shortcut.patient')}</span>
          <span><kbd className={kbd}>Alt+T</kbd> {t('shortcut.test')}</span>
          <span><kbd className={kbd}>Ctrl+Enter</kbd> {t('shortcut.save')}</span>
        </p>
      </div>

      {/*
        Booking is two jobs: deciding WHO and WHAT, then settling HOW MUCH.
        Stacked in one column they read as one long form, the money half sat
        below the fold, and the space beside it went to waste. Side by side,
        the total stays in view while tests are added. Written with logical
        flow only — no left/right — so RTL mirrors the whole thing for free.
      */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ── Who and what ─────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Patient */}
          <Card className="p-5">
            <div className="section-title mb-3">{t('reception.patient')}</div>
            {selected ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-500/8 p-3.5 ring-1 ring-brand-500/20">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {selected.fullName.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-strong">{selected.fullName}</div>
                    <div className="truncate text-sm text-muted">
                      {selected.mrNo}
                      {selected.age != null && ` · ${selected.age} ${t('common.years')}`}
                      {selected.sex && ` · ${t(`reception.${selected.sex.toLowerCase()}`)}`}
                      {selected.mobile && ` · ${selected.mobile}`}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelected(null); setPatientQuery(''); setPatientTab('EXISTING'); }}
                >
                  {t('reception.change')}
                </Button>
              </div>
            ) : (
              <>
                <Segmented
                  value={patientTab}
                  onChange={setPatientTab}
                  ariaLabel={t('reception.patient')}
                  options={[
                    { value: 'EXISTING', label: t('reception.tabExisting'), icon: <Search className="h-4 w-4 shrink-0" /> },
                    { value: 'NEW', label: t('reception.tabNew'), icon: <UserPlus className="h-4 w-4 shrink-0" /> },
                  ]}
                />
                <div className="mt-3">
                  {patientTab === 'EXISTING' ? (
                    <div ref={patientBox}>
                    <Combobox
                      query={patientQuery}
                      onQueryChange={setPatientQuery}
                      items={patientItems}
                      onSelect={(it) => { const p = patientResults.find((x) => x.id === it.id); if (p) setSelected(p); }}
                      placeholder={t('reception.searchPatient')}
                      loading={patLoading}
                      minChars={2}
                      emptyText={t('reception.noResults')}
                      leftIcon={<Icon name="search" className="h-4 w-4" />}
                    />
                    </div>
                  ) : (
                    /* A number typed into the search that found nobody is
                       almost always the new patient's own — carry it over
                       rather than making them read it out twice. */
                    <AddPatientForm
                      framed={false}
                      initialMobile={/^0\d{0,10}$/u.test(patientQuery.trim()) ? patientQuery.trim() : ''}
                      onCreated={(p) => { setSelected(p); toast('success', p.mrNo); }}
                      onUseExisting={(p) => setSelected(p)}
                      onCancel={() => setPatientTab('EXISTING')}
                    />
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Money still owed from earlier visits — said at the counter, where it can be collected. */}
          {selected && dues && dues.total > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-warn-text" role="status">
              <CircleAlert className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t('reception.duesTitle').replace('{amount}', formatPkr(dues.total))}</div>
                <div className="text-xs opacity-80">
                  {t('reception.duesSlips').replace('{slips}', dues.invoices.map((i) => `#${i.slipNo}`).join(', '))}
                </div>
              </div>
              <a href={`/billing?invoice=${dues.invoices[0].invoiceId}`} className="shrink-0 text-sm font-semibold underline underline-offset-2">
                {t('reception.duesCollect')}
              </a>
            </div>
          )}

          {/* Tests */}
          <Card className="p-5">
            <div className="section-title mb-3">{t('reception.tests')}</div>
            <div ref={testBox}>
            <Combobox
              query={testQuery}
              onQueryChange={setTestQuery}
              items={testItems}
              onSelect={(it) => {
                const tst = testResults.find((x) => x.id === it.id);
                if (tst && !packagedTestIds.has(tst.id)) setCart((c) => (c.some((x) => x.id === tst.id) ? c : [...c, { id: tst.id, name: tst.name, price: tst.price }]));
                setTestQuery('');
              }}
              placeholder={t('reception.searchTest')}
              loading={testLoading}
              leftIcon={<Icon name="search" className="h-4 w-4" />}
            />
            </div>

            {packages.some((p) => !cartPackages.some((x) => x.id === p.id)) && (
              <div className="mt-3">
                <Select
                  value=""
                  onChange={addPackage}
                  placeholder={t('reception.addPackage')}
                  options={packages
                    .filter((p) => !cartPackages.some((x) => x.id === p.id))
                    .map((p) => ({
                      value: p.id,
                      label: `${p.name} · ${formatPkr(p.price)} · ${t('reception.packageTests').replace('{n}', String(p.tests.length))}`,
                    }))}
                />
              </div>
            )}

            {(lastVisitNew || popularShown.length > 0) && (
              <div className="mt-3 space-y-3">
                {lastVisit && lastVisitNew && (
                  <button
                    type="button"
                    onClick={() => addToCart(lastVisit.tests)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-brand-500/25 bg-brand-500/[0.06] px-3.5 py-2.5 text-start text-sm transition-colors hover:bg-brand-500/10"
                  >
                    <RotateCcw className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-strong">
                        {t('reception.repeatLast').replace('{date}', shortDate(lastVisit.bookedAt))}
                      </span>
                      <span className="block truncate text-xs text-muted">{lastVisit.tests.map((x) => x.name).join(', ')}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                      {formatPkr(lastVisit.tests.reduce((s, x) => s + x.price, 0))}
                    </span>
                  </button>
                )}
                {popularShown.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-muted">{t('reception.common')}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {popularShown.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addToCart([p])}
                          title={formatPkr(p.price)}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-body transition-colors hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                        >
                          <Plus className="h-3 w-3" /> {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-1.5 text-xs font-medium text-muted">{t('reception.cart')}</div>
              {cartEmpty ? (
                <p className="rounded-xl border border-dashed border-line bg-surface-2/60 px-3 py-5 text-center text-sm text-subtle">
                  {t('reception.noTests')}
                </p>
              ) : (
                <ul className="stagger space-y-0.5">
                  {cartPackages.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg bg-brand-500/[0.05] px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold text-body">
                          <Package className="h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-300" /> {p.name}
                        </span>
                        <span className="block text-xs text-muted">{p.tests.map((x) => x.name).join(' · ')}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-muted">{formatPkr(p.price)}</span>
                        <button
                          onClick={() => setCartPackages((ps) => ps.filter((x) => x.id !== p.id))}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-subtle transition-colors hover:bg-danger-soft hover:text-red-600"
                          aria-label={t('common.remove')}
                        >✕</button>
                      </span>
                    </li>
                  ))}
                  {cart.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-body">{c.name}</span>
                        {testRemarks[c.id]?.trim() && noteOpen !== c.id && (
                          <span className="block truncate text-xs text-muted">{testRemarks[c.id]}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-muted">{formatPkr(c.price)}</span>
                        <button
                          onClick={() => setCart((cc) => cc.filter((x) => x.id !== c.id))}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-subtle transition-colors hover:bg-danger-soft hover:text-red-600"
                          aria-label={t('common.remove')}
                        >✕</button>
                        <button
                          type="button"
                          onClick={() => setNoteOpen(noteOpen === c.id ? null : c.id)}
                          className={cn('order-first flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-surface-3',
                            testRemarks[c.id]?.trim() ? 'text-brand-600 dark:text-brand-300' : 'text-subtle')}
                          aria-label={t('reception.testNote')}
                          title={t('reception.testNote')}
                        ><StickyNote className="h-3.5 w-3.5" /></button>
                      </span>
                      {noteOpen === c.id && (
                        <input
                          autoFocus
                          value={testRemarks[c.id] ?? ''}
                          onChange={(e) => setTestRemarks((r) => ({ ...r, [c.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') setNoteOpen(null); }}
                          maxLength={200}
                          placeholder={t('reception.testNotePlaceholder')}
                          className="field mt-1.5 w-full py-2 text-sm"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Sample and report — where the tube is drawn, and the time the patient is told to come back. */}
          <Card className="p-5">
            <div className="section-title mb-3 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" /> {t('reception.collection')}
            </div>
            <span className="label">{t('reception.sampleSource')}</span>
            <Segmented
              size="sm"
              value={sampleSource}
              onChange={setSampleSource}
              ariaLabel={t('reception.sampleSource')}
              options={[
                { value: 'INSIDE_LAB', label: t('sample.INSIDE_LAB') },
                { value: 'OUTSIDE_LAB', label: t('sample.OUTSIDE_LAB') },
                { value: 'HOME', label: t('sample.HOME') },
                { value: 'EXISTING', label: t('sample.EXISTING') },
              ]}
            />
            <label className="label mt-3" htmlFor="report-due">{t('reception.reportDue')}</label>
            <input
              id="report-due"
              type="datetime-local"
              value={reportDue}
              onChange={(e) => setReportDue(e.target.value)}
              className="field"
            />
            <p className="mt-1.5 text-xs text-subtle">{t('reception.reportDueHint')}</p>
          </Card>

          {/* Comments — anything the lab or the record needs that has no field
              of its own: an instruction, who referred them, why a discount. */}
          <Card className="p-5">
            <label htmlFor="booking-notes" className="section-title mb-3 flex items-center gap-1.5">
              <MessageSquareText className="h-4 w-4" /> {t('reception.notes')}
            </label>
            <textarea
              id="booking-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('reception.notesPlaceholder')}
              className="field min-h-[5.5rem] resize-y leading-relaxed"
            />
            <p className="mt-1.5 flex justify-between gap-3 text-xs text-subtle">
              <span>{t('reception.notesHint')}</span>
              <span className="shrink-0 tabular-nums">{notes.length}/500</span>
            </p>
          </Card>
        </div>

        {/* ── How much ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="section-title mb-3">{t('reception.billing')}</div>

            {partners.length > 0 && (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div>
                  <span className="label">{t('reception.bookedFor')}</span>
                  <Select
                    value={partnerId}
                    onChange={(v) => {
                      setPartnerId(v);
                      const pl = partners.find((x) => x.id === v);
                      if (pl?.rateGroupId) choosePriceList(pl.rateGroupId);
                    }}
                    options={[{ value: '', label: t('reception.walkIn') }, ...partners.map((x) => ({ value: x.id, label: x.name }))]}
                  />
                </div>
                {partnerId && (
                  <div>
                    <label className="label" htmlFor="b2b-no">{t('reception.b2bNo')}</label>
                    <input id="b2b-no" value={b2bNo} onChange={(e) => setB2bNo(e.target.value)} maxLength={40} className="field" />
                  </div>
                )}
              </div>
            )}

            {(rateGroups.length > 0 || collectionPoints.length > 0) && (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {collectionPoints.length > 0 && (
                  <div>
                    <span className="label">{t('reception.collectionPoint')}</span>
                    <Select
                      value={collectionPointId}
                      onChange={(v) => {
                        setCollectionPointId(v);
                        const cp = collectionPoints.find((x) => x.id === v);
                        if (cp?.rateGroupId) choosePriceList(cp.rateGroupId);
                      }}
                      options={[{ value: '', label: t('reception.noCollectionPoint') }, ...collectionPoints.map((c) => ({ value: c.id, label: c.name }))]}
                    />
                  </div>
                )}
                {rateGroups.length > 0 && (
                  <div>
                    <span className="label">{t('reception.priceList')}</span>
                    <Select
                      value={rateGroupId}
                      onChange={choosePriceList}
                      options={[{ value: '', label: t('reception.standardPrices') }, ...rateGroups.map((g) => ({ value: g.id, label: g.name }))]}
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="label">{t('reception.doctor')}</span>
                {!addingDoctor && (
                  <button
                    type="button"
                    onClick={() => { setAddingDoctor(true); setDocError(null); }}
                    className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                  >
                    <Plus className="h-3 w-3" /> {t('reception.addDoctor')}
                  </button>
                )}
              </div>
              {addingDoctor ? (
                <div className="space-y-2 rounded-xl border border-dashed border-brand-300/60 bg-brand-500/5 p-3">
                  <input
                    className="field"
                    autoFocus
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDoctor(); } }}
                    placeholder={t('reception.doctorName')}
                  />
                  <input
                    className="field"
                    value={docClinic}
                    onChange={(e) => setDocClinic(e.target.value)}
                    placeholder={t('reception.doctorClinic')}
                  />
                  {docError && <p className="text-sm text-danger-text"><Tr text={docError} /></p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveDoctor} loading={docSaving} disabled={docName.trim().length < 2}>
                      {t('reception.addDoctorSave')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingDoctor(false)}>{t('common.cancel')}</Button>
                  </div>
                </div>
              ) : (
                <Select
                  value={doctorId}
                  onChange={setDoctorId}
                  placeholder={t('common.none')}
                  options={[{ value: '', label: t('common.none') }, ...doctors.map((d) => ({ value: d.id, label: d.name }))]}
                />
              )}
            </div>

            {/*
              Two questions, asked in order. First: is there a discount at all?
              Most slips have none, so that is a switch which is off, and the
              whole apparatus stays folded away behind it. Only then: on what
              basis — a family card the patient holds, or someone's authority.

              There is deliberately no free-typed amount any more. A number
              bounded only by the bill, recorded against nobody, was the one
              discount nobody could answer for afterwards.
            */}
            <div className="mt-4">
              <span className="label">{t('reception.discount')}</span>

              {ownCard ? null : (
                <Checkbox
                  checked={discountOn}
                  onChange={setDiscountOn}
                  label={t('reception.discountApply')}
                  hint={t('reception.discountApplyHint')}
                />
              )}

              {/* Found a card on a related number: offer it, do not make reception
                  go looking for something they have no reason to suspect exists.
                  Shown whether or not the discount switch is on — a switch that
                  is off is exactly when nobody would think to look — and taking
                  the offer turns the switch on. */}
              {!ownCard && suggested?.info.found && !(discountOn && discountSource === 'CARD') && (
                <button
                  type="button"
                  onClick={() => {
                    setDiscountOn(true);
                    setDiscountSource('CARD');
                    setCardMode('JOIN');
                    setJoinMobile(suggested.mobile);
                  }}
                  className="mt-2.5 flex w-full items-center gap-2 rounded-xl border border-info-line bg-info-soft px-3.5 py-2.5 text-start text-sm text-info-text transition-opacity hover:opacity-90"
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
              ) : discountOn ? (
                <div className="mt-2.5">
                  <Segmented
                    value={discountSource}
                    onChange={setDiscountSource}
                    ariaLabel={t('reception.discount')}
                    options={[
                      {
                        value: 'CARD',
                        label: t('familyCard.title'),
                        icon: <CreditCard className="h-4 w-4 shrink-0" />,
                        // A card is attached to a person: without one chosen there
                        // is nothing to look up, prefill, or join. Offering the
                        // option anyway only produces a failure two clicks later.
                        disabled: !selected,
                        title: !selected ? t('reception.cardNeedsPatient') : undefined,
                      },
                      {
                        value: 'MANUAL',
                        label: t('reception.discManual'),
                        icon: <BadgePercent className="h-4 w-4 shrink-0" />,
                      },
                    ]}
                  />

                  {discountSource === 'MANUAL' && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-stretch gap-2">
                        <div className="w-28 shrink-0">
                          <Segmented
                            value={manualType}
                            onChange={setManualType}
                            ariaLabel={t('reception.manualType')}
                            options={[
                              { value: 'FIXED', label: 'Rs' },
                              { value: 'PERCENT', label: '%' },
                            ]}
                          />
                        </div>
                        <div className="field flex min-w-0 flex-1 items-center gap-2 py-0 pe-3.5 focus-within:border-brand-500 focus-within:bg-surface">
                          <input
                            type="number"
                            min={0}
                            max={manualType === 'PERCENT' ? 100 : undefined}
                            inputMode="decimal"
                            value={manualValue}
                            placeholder="0"
                            aria-label={t('reception.manualAmount')}
                            onChange={(e) => setManualValue(e.target.value)}
                            className="field-inner py-2.5 text-base font-semibold tabular-nums"
                          />
                          <span className="shrink-0 text-sm font-bold text-subtle">{manualType === 'PERCENT' ? '%' : 'Rs'}</span>
                        </div>
                      </div>
                      {manualType === 'PERCENT' && manualNum > 100 ? (
                        <p className="text-sm text-warn-text">{t('reception.manualPctMax')}</p>
                      ) : manualType === 'FIXED' && total > 0 && manualNum > total ? (
                        <p className="text-sm text-warn-text">{t('reception.manualCapped').replace('{amount}', formatPkr(total))}</p>
                      ) : (
                        <p className="text-xs text-muted">{t('reception.manualHint')}</p>
                      )}
                    </div>
                  )}

                  {discountSource === 'CARD' && (
                    <div className="mt-3 space-y-2.5">
                      <Segmented
                        size="sm"
                        value={cardMode}
                        onChange={setCardMode}
                        ariaLabel={t('familyCard.title')}
                        options={[
                          { value: 'JOIN', label: t('reception.cardJoin'), icon: <Users className="h-3.5 w-3.5 shrink-0" /> },
                          { value: 'CREATE', label: t('reception.cardCreate'), icon: <CreditCard className="h-3.5 w-3.5 shrink-0" /> },
                        ]}
                      />

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
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <div className="space-y-1.5 rounded-xl bg-surface-2 p-4 text-sm">
              <div className="flex justify-between text-muted"><span>{t('reception.total')}</span><span>{formatPkr(total)}</span></div>
              <div className="flex justify-between gap-2 text-muted">
                {/* The summary names the basis, not just the amount: "care of
                    Imran (10%)" is what makes the line answerable later. */}
                <span className="min-w-0 truncate">
                  {cardApplies
                    ? `${t('familyCard.title')} (${effectivePct}%)`
                    : manualAmount > 0
                      ? `${t('reception.discManual')}${manualType === 'PERCENT' ? ` (${Math.min(manualNum, 100)}%)` : ''}`
                      : t('reception.discount')}
                </span>
                <span className="whitespace-nowrap">− {formatPkr(discountAmount)}</span>
              </div>
              {feeCharged > 0 && (
                <div className="flex justify-between text-muted">
                  <span>{t('reception.cardFee')}</span>
                  <span className="whitespace-nowrap">+ {formatPkr(feeCharged)}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 border-t border-line pt-2 text-lg font-extrabold text-strong">
                <span>{t('reception.net')}</span>
                <span className="whitespace-nowrap text-brand-600 dark:text-brand-300">{formatPkr(net)}</span>
              </div>
            </div>

            {billedToPartner && partner && (
              <p className="mt-4 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm font-medium text-info-text">
                {t('reception.billedToPartner').replace('{name}', partner.name)}
              </p>
            )}

            {net > 0 && !billedToPartner && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="label mb-0">{t('pay.title')}</span>
                  <div className="w-44">
                    <Segmented
                      size="sm"
                      value={payNow}
                      onChange={setPayNow}
                      options={[
                        { value: 'NOW', label: t('pay.now') },
                        { value: 'LATER', label: t('pay.later') },
                      ]}
                    />
                  </div>
                </div>

                {payNow === 'NOW' && (
                  <>
                    <div>
                      <span className="label">{t('reception.account')}</span>
                      {accounts.length > 0 && accounts.length <= 4 ? (
                        <Segmented
                          value={accountId}
                          onChange={setAccountId}
                          ariaLabel={t('reception.account')}
                          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                        />
                      ) : (
                        <Select value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
                      )}
                    </div>
                    <div>
                      <label className="label" htmlFor="pay-received">{t('pay.received')}</label>
                      <div className="field flex items-center gap-2 py-0 ps-3.5 focus-within:border-brand-500 focus-within:bg-surface">
                        <span className="shrink-0 text-sm font-bold text-subtle">Rs</span>
                        <input
                          id="pay-received"
                          type="number"
                          min={0}
                          inputMode="decimal"
                          value={receivedTouched ? received : String(net)}
                          onChange={(e) => { setReceivedTouched(true); setReceived(e.target.value); }}
                          className="field-inner py-2.5 text-base font-semibold tabular-nums"
                        />
                      </div>
                      {/* The sum the cashier would otherwise do in their head. */}
                      {changeDue > 0 && (
                        <p className="mt-1.5 rounded-lg bg-ok-soft px-3 py-2 text-sm font-semibold text-ok-text">
                          {t('pay.change').replace('{amount}', formatPkr(changeDue))}
                        </p>
                      )}
                      {stillDue > 0 && (
                        <p className="mt-1.5 text-sm text-warn-text">
                          {t('pay.remaining').replace('{amount}', formatPkr(stillDue))}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <p className="mt-3 animate-fade-in rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text"><Tr text={error} /></p>}

            <Button size="lg" className="mt-4 w-full" onClick={book} loading={isPending} disabled={!selected || cartEmpty} title="Ctrl+Enter">
              <Icon name="print" className="h-4 w-4" /> {t('reception.save')}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
