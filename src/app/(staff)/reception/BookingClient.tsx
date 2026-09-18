'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, BadgePercent, Check, CircleAlert, ClipboardList, CreditCard, FlaskConical, Keyboard, Package, Plus,
  ReceiptText, RotateCcw, Search, StickyNote, TestTube, Trash2, UserPlus, UserRound, Wallet, type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { useFeatures } from '@/core/features/FeaturesProvider';
import { SAMPLE_SOURCE_FEATURES } from '@/core/features/catalog';
import {
  describeCardForBookingAction,
  currentCardForPatientAction,
  cardOnNumberAction,
  getCardPolicyAction,
  familyCardHintAction,
  type BookingCardInfo,
  type FamilyCardHintDTO,
} from '@/modules/familycard/familycard.actions';
import { MEMBER_RELATIONS, type Relation } from '@/modules/familycard/familycard.rules';
import { Button } from '@/components/ui/Button';
import { AddPatientForm } from '@/components/patients/AddPatientForm';
import { Select } from '@/components/ui/Select';
import { Combobox, type ComboItem } from '@/components/ui/Combobox';
import { Segmented } from '@/components/ui/Segmented';
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
import { DatePicker } from '@/components/ui/DatePicker';

type CartItem = { id: string; name: string; price: number };

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));

const kbd = 'rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-body';

export function BookingClient() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const f = useFeatures();

  // Two steps: booking (who, the visit, the tests) and billing. The tests
  // price themselves on the first, with or without a patient.
  const [step, setStep] = useState(0);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

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
  const [cardPolicy, setCardPolicy] = useState({ fee: 0, discountPct: 0, discountOnIssue: true, memberCap: 0 });

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Speed at the counter. Most bookings repeat something: this patient's last
  // tests, or one of the handful the lab books all day. Both are one tap away
  // instead of a search each.
  const [lastVisit, setLastVisit] = useState<{ bookedAt: string; tests: QuickTest[] } | null>(null);
  const [popular, setPopular] = useState<QuickTest[]>([]);
  // Packages, common tests and "repeat last visit" arrive in the background.
  // Their slot holds one placeholder until all of them are in, so the cart
  // below never jumps when a list lands.
  const [pickerReady, setPickerReady] = useState(false);
  const [lastVisitFor, setLastVisitFor] = useState<string | null>(null);
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
    Promise.allSettled([
      popularTestsAction().then(setPopular).catch(() => setPopular([])),
      listPackagesAction().then(setPackages).catch(() => setPackages([])),
    ]).then(() => setPickerReady(true));
    listRateGroupsAction().then(setRateGroups).catch(() => setRateGroups([]));
    listCollectionPointsAction().then(setCollectionPoints).catch(() => setCollectionPoints([]));
    listInwardPartnersAction().then(setPartners).catch(() => setPartners([]));
    listPaymentAccountsAction()
      .then((a) => { setAccounts(a); setAccountId((cur) => cur || a[0]?.id || ''); })
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (!selected) { setLastVisit(null); setDues(null); return; }
    const id = selected.id;
    lastVisitTestsAction(id).then(setLastVisit).catch(() => setLastVisit(null)).finally(() => setLastVisitFor(id));
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
    if (!f['booking.familyCards']) { setOwnCard(null); setSuggested(null); return; }
    currentCardForPatientAction(selected.id)
      .then((card) => {
        setOwnCard(card);
        // Their own card starts on; the counter may still leave it off.
        if (card) { setDiscountOn(true); setDiscountSource('CARD'); }
      })
      .catch(() => setOwnCard(null));

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
  }, [selected, patientQuery, f]);

  // The family card banner. Whichever number this booking is about — the card
  // the chosen patient already holds, their own mobile, a number typed into the
  // search, or the mobile on the new-patient form — is checked as soon as it is
  // a full number, and the result stays pinned under the steps until the
  // patient changes, so a card is never discovered only at the till.
  const [formMobile, setFormMobile] = useState('');
  const [cardHint, setCardHint] = useState<FamilyCardHintDTO | null>(null);
  useEffect(() => {
    if (!f['booking.familyCards']) { setCardHint(null); return; }
    const typed = selected ? patientQuery : patientTab === 'NEW' ? formMobile : patientQuery;
    const numbers = [...new Set(
      [ownCard?.mobile, selected?.mobile, typed]
        .map((m) => m?.trim())
        .filter((m): m is string => !!m && /^0\d{10}$/u.test(m)),
    )];
    if (numbers.length === 0) { setCardHint(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const m of numbers) {
        const hint = await familyCardHintAction(m, selected?.id ?? null).catch(() => null);
        if (cancelled) return;
        if (hint) { setCardHint(hint); return; }
      }
      if (!cancelled) setCardHint(null);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [f, ownCard, selected, patientQuery, patientTab, formMobile]);

  // Picking "family card" used to open an empty number field, two steps after
  // the booking had already found a card and shown whose it is. The number the
  // banner is about is filled in instead, and stays editable for the case where
  // the card is held on some other number.
  const foundCardMobile = suggested?.mobile ?? (cardHint?.usable ? cardHint.mobile : null);
  const [joinPrefilled, setJoinPrefilled] = useState(false);
  useEffect(() => {
    if (!(discountOn && discountSource === 'CARD' && cardMode === 'JOIN')) return;
    if (joinMobile.trim() || !foundCardMobile) return;
    setJoinMobile(foundCardMobile);
    setJoinPrefilled(true);
  }, [discountOn, discountSource, cardMode, joinMobile, foundCardMobile]);
  useEffect(() => { setJoinPrefilled(false); }, [selected]);

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
  const testCount = cart.length + cartPackages.reduce((s, p) => s + p.tests.length, 0);
  /** Billing opens once there is someone to bill and something on the bill. */
  const canReach = (i: number) => i === 0 || (!!selected && !cartEmpty);
  // Choosing the patient hands the keyboard to the test search beside it: the
  // next thing typed at the counter is almost always a test name.
  const choosePatient = (p: PatientDTO) => {
    setSelected(p);
    setTimeout(() => testBox.current?.querySelector('input')?.focus(), 50);
  };
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
  // A card the patient already holds is on unless the counter leaves it off
  // for this visit (to give a manual discount instead — never both).
  const cardPct = ownCard
    ? (usingCard ? ownCard.discountPct : 0)
    : (usingCard && cardMode === 'JOIN' && joinInfo?.canJoin ? joinInfo.discountPct ?? 0 : 0);
  const cardWaived = !!ownCard && !usingCard;
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

  // A card that is doing something is named; one merely sitting on the number
  // is offered. Anything else (a manual discount) needs no note here.
  const cardNote = cardApplies
    ? t('book.cardSaving').replace('{pct}', String(effectivePct))
    : cardHint?.usable && !cardApplies && !cardWaived
      ? t('book.cardOffer').replace('{pct}', String(cardHint.discountPct))
      : null;
  const stillDue = Math.max(0, net - receivedAmount);

  // A price check quotes a discount before anyone is registered, through the
  // same tabs: the family card rate (a card on the number typed, or the lab's
  // usual rate) or a manual one. Only an estimate on screen; nothing is saved.
  const quotePct = cardHint?.usable ? cardHint.discountPct : cardPolicy.discountPct;
  const estimatePct = selected ? cardPct : (usingCard && (!cardHint || cardHint.usable) ? quotePct : 0);
  const estimateOff = Math.round((total * estimatePct) / 100);
  const quoteOff = estimatePct > 0 ? estimateOff : manualAmount;
  // The bar carries the quote too, while there is no patient to bill.
  const barNet = !selected ? total - quoteOff : net;
  const barNote = !selected && estimatePct > 0 ? t('book.cardSaving').replace('{pct}', String(estimatePct)) : cardNote;

  // The figures under the tests: the real bill once a patient is chosen, a
  // price check's quote before.
  const sumDiscount = selected ? discountAmount : quoteOff;
  const sumDiscLabel = selected
    ? cardApplies
      ? `${t('book.familyCard')} ${effectivePct}%`
      : manualAmount > 0
        ? `${t('reception.discManual')}${manualType === 'PERCENT' ? ` ${Math.min(manualNum, 100)}%` : ''}`
        : t('reception.discount')
    : estimatePct > 0
      ? `${t('book.familyCard')} ${estimatePct}%`
      : manualAmount > 0
        ? `${t('reception.discManual')}${manualType === 'PERCENT' ? ` ${Math.min(manualNum, 100)}%` : ''}`
        : t('reception.discount');

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
        familyCardMode: usingCard && !ownCard ? cardMode : 'NONE',
        waiveFamilyCard: cardWaived,
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
  // Only the ways of taking a sample this lab uses; with just one there is nothing to ask.
  const sampleOptions = (Object.keys(SAMPLE_SOURCE_FEATURES) as (keyof typeof SAMPLE_SOURCE_FEATURES)[])
    .filter((src) => f[SAMPLE_SOURCE_FEATURES[src]])
    .map((src) => ({ value: src, label: t(`sample.${src}`) }));
  useEffect(() => {
    if (!sampleOptions.some((o) => o.value === sampleSource) && sampleOptions[0]) setSampleSource(sampleOptions[0].value);
  }, [sampleOptions, sampleSource]);
  // One kind of discount switched off leaves only the other to choose.
  useEffect(() => {
    if (!f['booking.familyCards'] && discountSource === 'CARD') setDiscountSource('MANUAL');
    if (!f['booking.manualDiscount'] && discountSource === 'MANUAL') setDiscountSource('CARD');
  }, [f, discountSource]);
  const showCP = f['booking.collectionPoints'] && collectionPoints.length > 0;
  const showB2B = f['booking.b2b'] && partners.length > 0;
  const counterGroups = rateGroups.filter((g) => g.atCounter);
  const discountsOn = f['booking.familyCards'] || f['booking.manualDiscount'];

  // Ctrl+Enter moves on to billing, and books from there.
  const bookRef = useRef(book);
  bookRef.current = () => {
    if (step === 0) { if (canReach(1)) setStep(1); } else book();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyP') {
        e.preventDefault();
        setStep(0);
        setPatientTab('EXISTING');
        setTimeout(() => patientBox.current?.querySelector('input')?.focus(), 50);
      } else if (e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        setStep(0);
        setTimeout(() => testBox.current?.querySelector('input')?.focus(), 50);
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


  // The chosen patient, as a card: a saved record, not just a line of text.
  // Its height is the patient slot's, so choosing someone moves nothing.
  const patientCard = selected && (
    <div className="flex h-[4.75rem] items-center justify-between gap-3 rounded-xl bg-brand-500/8 px-3.5 ring-1 ring-brand-500/20">
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
      {step === 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setSelected(null); setPatientQuery(''); setPatientTab('EXISTING'); }}
        >
          {t('reception.change')}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
          {t('book.editBooking')}
        </Button>
      )}
    </div>
  );

  // The chosen tests with their prices — edited while booking, read back
  // at billing (the action cells stay, empty, so prices keep their column).
  const editing = step === 0;
  // The discount: whether and how, as tabs, and what each needs in one block
  // of fixed height under them. It sits in the tests column at both steps.
  const discountSection = (<>
    <div className="mb-3 flex h-10 items-center justify-between gap-3">
      <H className="mb-0" icon={BadgePercent}>{t('reception.discount')}</H>
      {discountsOn && (
        <div className="w-[18.5rem] shrink-0">
          <Segmented
            size="sm"
            value={!discountOn ? 'NONE' : discountSource}
            onChange={(v) => {
              if (v === 'NONE') { setDiscountOn(false); return; }
              setDiscountOn(true);
              setDiscountSource(v);
            }}
            ariaLabel={t('reception.discount')}
            options={[
              { value: 'NONE', label: t('book.noDiscount') },
              ...(f['booking.familyCards'] ? [{ value: 'CARD' as const, label: t('book.familyCard') }] : []),
              ...(f['booking.manualDiscount'] ? [{ value: 'MANUAL' as const, label: t('reception.discManual') }] : []),
            ]}
          />
        </div>
      )}
    </div>
    {!discountsOn ? (
      <p className="text-sm text-muted">{t('book.noDiscounts')}</p>
    ) : (<>
      {/* Whether and how, as tabs; what each needs sits in the block
          under them — no floating panel. The block has one height for
          every tab, so switching never moves the bill below it. A
          patient's own card can be left off here, for a manual
          discount instead; the two never stack. */}
      <div className="flex h-[9.75rem] flex-col rounded-xl bg-surface-2/60 p-3.5 ring-1 ring-line/70">
        {!discountOn ? (
          <div className="m-auto max-w-sm text-center">
            {cardWaived ? (<>
              <p className="text-sm font-semibold text-strong">{t('book.cardOffThisVisit').replace('{pct}', String(ownCard!.discountPct))}</p>
              <button
                type="button"
                onClick={() => { setDiscountOn(true); setDiscountSource('CARD'); }}
                className="mt-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                {t('book.useCardAgain')}
              </button>
            </>) : suggested?.info.found ? (suggested.info.canJoin ? (
              <button
                type="button"
                onClick={() => { setDiscountOn(true); setDiscountSource('CARD'); setCardMode('JOIN'); setJoinMobile(suggested.mobile); }}
                className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-300"
              >
                <CreditCard className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {t('reception.cardFoundJoin')
                    .replace('{name}', suggested.info.holderName ?? '')
                    .replace('{pct}', String(suggested.info.discountPct ?? 0))}
                </span>
              </button>
            ) : (
              <p className="text-sm text-muted">{t('reception.cardFoundBlocked').replace('{name}', suggested.info.holderName ?? '')}</p>
            )) : (<>
              <p className="text-sm font-semibold text-strong">{t('book.noDiscountLine')}</p>
              <p className="mt-1 text-xs text-muted">{t('book.noDiscountSub')}</p>
            </>)}
          </div>
        ) : discountSource === 'CARD' ? (
          !selected ? (
            // A price check: the card rate is only quoted.
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 truncate text-sm font-semibold text-strong">
                  {cardHint ? t('book.cardOf').replace('{name}', cardHint.holderName) : t('book.cardQuoteTitle')}
                </span>
                <span className="ms-auto shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {t('book.cardPctOff').replace('{pct}', String(quotePct))}
                </span>
              </div>
              <p className="mt-1.5 truncate text-xs text-muted">
                {cardHint
                  ? `${cardHint.mobile} · ${t('book.cardMembersUsed').replace('{used}', String(cardHint.used)).replace('{cap}', String(cardHint.cap))}`
                  : [
                      cardPolicy.memberCap > 0 ? t('book.cardUpTo').replace('{cap}', String(cardPolicy.memberCap)) : null,
                      t('book.cardNewCosts').replace('{fee}', formatPkr(cardPolicy.fee)),
                    ].filter(Boolean).join(' · ')}
              </p>
              {cardHint && !cardHint.usable ? (
                <p className="mt-3 text-sm font-semibold text-danger-text">{t('book.cardInactive')}</p>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ok-text">
                  <Check className="h-4 w-4 shrink-0" /> {t('book.cardQuoteApplied')}
                </p>
              )}
              <p className="mt-auto text-xs text-muted">{t('book.cardQuoteBody')}</p>
            </div>
          ) : ownCard ? (
            // Their own card: nothing to choose, only to leave off.
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 truncate text-sm font-semibold text-strong">
                  {t('book.cardOf').replace('{name}', cardHint?.onThisCard ? cardHint.holderName : selected?.fullName ?? '')}
                </span>
                <span className="ms-auto shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {t('book.cardPctOff').replace('{pct}', String(ownCard.discountPct))}
                </span>
              </div>
              <p className="mt-1.5 truncate text-xs text-muted">
                {[ownCard.mobile, cardHint?.onThisCard ? t('book.cardMembersUsed').replace('{used}', String(cardHint.used)).replace('{cap}', String(cardHint.cap)) : null].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ok-text">
                <Check className="h-4 w-4 shrink-0" /> {t('book.cardAppliedAutoLine')}
              </p>
              <p className="mt-auto text-xs text-muted">{t('book.cardWaiveHint')}</p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div role="radiogroup" aria-label={t('familyCard.title')} className="grid grid-cols-2 gap-2">
                <CardChoice
                  selected={cardMode === 'JOIN'}
                  onSelect={() => setCardMode('JOIN')}
                  title={t('reception.cardJoin')}
                  sub={t('reception.cardJoinWhat')}
                  cost={t('reception.cardNoFee')}
                />
                <CardChoice
                  selected={cardMode === 'CREATE'}
                  onSelect={() => setCardMode('CREATE')}
                  title={t('reception.cardCreate')}
                  sub={t('reception.cardCreateWhat').replace('{pct}', String(cardPolicy.discountPct))}
                  cost={t('reception.cardFeeShort').replace('{fee}', formatPkr(cardPolicy.fee))}
                />
              </div>
              <div className={cn('mt-2 grid gap-2', cardMode === 'JOIN' ? 'grid-cols-[minmax(0,1fr)_9rem]' : 'grid-cols-1')}>
                <input
                  id="card-number"
                  aria-label={t('book.cardNumber')}
                  className="field"
                  inputMode="tel"
                  placeholder={t('book.cardNumberPh')}
                  value={cardMode === 'JOIN' ? joinMobile : newCardMobile}
                  onChange={(e) => (cardMode === 'JOIN' ? setJoinMobile(e.target.value) : setNewCardMobile(e.target.value))}
                />
                {cardMode === 'JOIN' && (
                  <Select
                    value={joinRelation}
                    onChange={(v) => setJoinRelation(v as Relation)}
                    disabled={!(joinInfo?.found && joinInfo.canJoin)}
                    options={MEMBER_RELATIONS.map((r) => ({ value: r, label: t(`relation.${r}`) }))}
                  />
                )}
              </div>
              {/* Always a line here, so a lookup coming back never moves anything. */}
              <p className={cn('mt-auto flex min-h-5 min-w-0 items-center gap-1.5 text-sm',
                cardMode === 'JOIN'
                  ? (joinInfo?.found && joinInfo.canJoin ? 'text-ok-text' : joinInfo ? 'text-danger-text' : 'text-subtle')
                  : (newCardClash ? 'text-danger-text' : newCardValid ? 'text-ok-text' : 'text-subtle'))}
              >
                {cardMode === 'JOIN' ? (
                  joinInfo?.found && joinInfo.canJoin ? (<>
                    <Check className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      <b className="font-semibold">{joinInfo.holderName}</b> · {joinInfo.discountPct}% · {joinInfo.used}/{joinInfo.cap} {t('familyCard.slotsUsed')}
                    </span>
                  </>) : <span className="truncate">{joinInfo ? (joinInfo.reason ?? t('reception.cardNotFound'))
                    : joinPrefilled && joinMobile === foundCardMobile ? t('reception.cardJoinPrefilled')
                    : t('reception.cardJoinHint')}</span>
                ) : <span className="truncate">{newCardClash
                  ? t('reception.cardNumberTaken').replace('{name}', newCardClash.holderName ?? '')
                  : t('reception.cardCreateHint')}</span>}
              </p>
            </div>
          )
        ) : (
          <div className="flex h-full flex-col">
            <label htmlFor="manual-amount" className="mb-2 text-sm font-semibold text-strong">{t('book.manualAmount')}</label>
            <div className="flex items-stretch gap-2">
              <div className="w-24 shrink-0">
                <Segmented
                  size="sm"
                  value={manualType}
                  onChange={setManualType}
                  ariaLabel={t('reception.manualType')}
                  options={[{ value: 'FIXED', label: 'Rs' }, { value: 'PERCENT', label: '%' }]}
                />
              </div>
              <input
                id="manual-amount"
                type="number"
                min={0}
                max={manualType === 'PERCENT' ? 100 : undefined}
                inputMode="decimal"
                value={manualValue}
                placeholder="0"
                onChange={(e) => setManualValue(e.target.value)}
                className="field min-w-0 flex-1 font-semibold tabular-nums"
              />
            </div>
            <p className={cn('mt-2 text-sm',
              (manualType === 'PERCENT' && manualNum > 100) || (manualType === 'FIXED' && total > 0 && manualNum > total) ? 'text-warn-text' : 'text-muted')}>
              {manualType === 'PERCENT' && manualNum > 100
                ? t('reception.manualPctMax')
                : manualType === 'FIXED' && total > 0 && manualNum > total
                  ? t('reception.manualCapped').replace('{amount}', formatPkr(total))
                  : t('reception.manualHint')}
            </p>
            {cardWaived && (
              <p className="mt-auto flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('book.cardInsteadManual').replace('{pct}', String(ownCard!.discountPct))}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </>)}
  </>);

  // Every row is name · note · price · remove. The price and the remove
  // column have fixed widths, so prices end on one line down the list; the
  // remove button closes the row. At billing there is nothing to edit, and
  // the price sits at the edge.
  const ROW = editing
    ? 'grid grid-cols-[minmax(0,1fr)_auto_6rem_3.5rem] items-center gap-2'
    : 'grid grid-cols-[minmax(0,1fr)_auto_6rem] items-center gap-2';
  // The totals under the list end in the price column too.
  const SUM = editing ? 'grid grid-cols-[minmax(0,1fr)_6rem_3.5rem] items-center gap-2' : 'flex justify-between gap-3';
  const testsList = (<>
    {/* The chosen tests: a column header, hairlines between rows, prices in one column. */}
    <div className={cn(ROW, 'mt-3 h-7 border-b border-line text-[11px] font-semibold uppercase tracking-wide text-subtle')}>
      <span>{t('book.colTest')}</span>
      <span aria-hidden />
      <span className="text-end">{t('book.colPrice')}</span>
      {editing && (
        <span className="text-end">
          {!cartEmpty && (
            <button
              type="button"
              onClick={() => { setCart([]); setCartPackages([]); setTestRemarks({}); }}
              className="text-[11px] font-semibold normal-case tracking-normal text-danger-text hover:underline"
            >
              {t('book.clearAll')}
            </button>
          )}
        </span>
      )}
    </div>
    <ul>
      {cartEmpty && (
        <li className="flex h-[53px] items-center border-b border-line text-sm text-subtle">{t('reception.noTests')}</li>
      )}
      {cartPackages.map((pk) => (
        <li key={pk.id} className={cn(ROW, 'border-b border-line py-2')}>
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <Package className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-5 text-strong">{pk.name}</span>
              <span className="block truncate text-xs leading-4 text-muted">{pk.tests.map((x) => x.name).join(' · ')}</span>
            </span>
          </span>
          <span aria-hidden />
          <span className="text-end text-sm font-semibold tabular-nums text-strong">{formatPkr(pk.price)}</span>
          {editing && (
            <span className="flex justify-end">
              <RowDelete label={t('common.remove')} onClick={() => setCartPackages((ps) => ps.filter((x) => x.id !== pk.id))} />
            </span>
          )}
        </li>
      ))}
      {cart.map((c) => {
        const note = testRemarks[c.id]?.trim();
        return (
          <li key={c.id} className="border-b border-line py-2">
            <div className={ROW}>
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                  <TestTube className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium leading-5 text-strong">{c.name}</span>
                  {note && (noteOpen !== c.id || !editing) && (
                    <span className="block truncate text-xs leading-4 text-muted">{note}</span>
                  )}
                </span>
              </span>
              <span className="flex items-center">
                {editing && f['booking.testNotes'] && (
                  <button
                    type="button"
                    title={t('reception.testNote')}
                    aria-expanded={noteOpen === c.id}
                    onClick={() => setNoteOpen(noteOpen === c.id ? null : c.id)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold ring-1 transition-colors',
                      note || noteOpen === c.id
                        ? 'bg-brand-500/10 text-brand-700 ring-brand-500/30 dark:text-brand-300'
                        : 'text-muted ring-line hover:bg-surface-2 hover:text-strong',
                    )}
                  >
                    <StickyNote className="h-3.5 w-3.5" /> {t('book.note')}
                  </button>
                )}
              </span>
              <span className="text-end text-sm font-semibold tabular-nums text-strong">{formatPkr(c.price)}</span>
              {editing && (
                <span className="flex justify-end">
                  <RowDelete label={t('common.remove')} onClick={() => setCart((cc) => cc.filter((x) => x.id !== c.id))} />
                </span>
              )}
            </div>
            {editing && noteOpen === c.id && (
              <input
                autoFocus
                value={testRemarks[c.id] ?? ''}
                onChange={(e) => setTestRemarks((r) => ({ ...r, [c.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') setNoteOpen(null); }}
                maxLength={200}
                placeholder={t('reception.testNotePlaceholder')}
                className="field mt-2"
              />
            )}
          </li>
        );
      })}
    </ul>

    {/* Under the tests: what they cost, what the card takes off (Rs 0 until it
        is applied from the box below), and the total. Every row is always
        there, so applying the card changes figures, not the layout. At billing
        the full bill is on the right, so only the tests' cost stays here. */}
    {/* Shown once there is a test to price — with the family card under it.
        Until then their place is kept, so the first test moves nothing. */}
    <dl className={cn('mt-3 grid gap-1.5 text-sm', cartEmpty && 'invisible')} aria-hidden={cartEmpty}>
      <div className={SUM}>
        <dt className="text-muted">{testCount === 1 ? t('book.oneTest') : t('book.nTests').replace('{n}', String(testCount))}</dt>
        <dd className="text-end font-semibold tabular-nums text-strong">{formatPkr(total)}</dd>
      </div>
      {editing && (<>
        <div className={SUM}>
          <dt className="text-muted">{sumDiscLabel}</dt>
          <dd className={cn('text-end font-semibold tabular-nums', sumDiscount > 0 ? 'text-ok-text' : 'text-subtle')}>− {formatPkr(sumDiscount)}</dd>
        </div>
        <div className={cn(SUM, 'items-baseline border-t border-line pt-2')}>
          <dt className="font-bold text-strong">{t('book.total')}</dt>
          <dd className="text-end text-base font-extrabold tabular-nums text-strong">{formatPkr(total - sumDiscount)}</dd>
        </div>
      </>)}
    </dl>
  </>);

  return (
    <div className="page page-wide">
      {/* The steps are two small icons before the title, not a tab bar: they say
          where the booking is, and Continue is the only way forward. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <StepIcons step={step} />
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('reception.title')}</h1>
          <span className="text-sm font-semibold text-muted">{step === 0 ? t('book.stepBooking') : t('book.stepBilling')}</span>
        </div>
        <p className="hidden items-center gap-3 text-xs text-subtle lg:flex">
          <Keyboard className="h-3.5 w-3.5 self-center" aria-hidden />
          <span><kbd className={kbd}>Alt+P</kbd> {t('shortcut.patient')}</span>
          <span><kbd className={kbd}>Alt+T</kbd> {t('shortcut.test')}</span>
          <span><kbd className={kbd}>Ctrl+Enter</kbd> {t('book.shortcutNext')}</span>
        </p>
      </div>

      {/*
        One sheet, split by a single hairline. No box around each part: a small
        heading and space mark the groups, fields have no outline until they
        are used, labels stand in one column and prices in another.

        Booking: who and the visit on the left, the tests and their prices on
        the right — which work with or without a patient, for someone asking
        what a set of tests will cost. Billing: the discount on the left, the
        bill and the payment on the right.
      */}
      {/*
        Two columns at every step, half and half. Booking: the patient and the
        visit on the left, the tests and their prices on the right. Billing:
        the patient's booking as a card on the left, the money on the right.
        The family card has one fixed place — the foot of the left column —
        in both, so it is always found in the same spot; only what it says
        changes.
      */}
      <div className="flex flex-col rounded-[1.25rem] bg-surface p-5 shadow-card ring-1 ring-line/60 sm:p-6 lg:min-h-[calc(100dvh-17rem)]">
        <div className="grid flex-1 gap-8 lg:grid-cols-2 lg:gap-0">
          <div className="flex min-w-0 flex-col lg:pe-8">
            {step === 0 ? (<>
              <div className="mb-3 flex h-10 items-center justify-between gap-3">
                <H className="mb-0" icon={UserRound}>{t('reception.patient')}</H>
                {!selected && (
                  <div className="w-52">
                    <Segmented
                      size="sm"
                      value={patientTab}
                      onChange={setPatientTab}
                      ariaLabel={t('reception.patient')}
                      options={[
                        { value: 'EXISTING', label: t('book.tabExistingShort'), icon: <Search className="h-3.5 w-3.5 shrink-0" /> },
                        { value: 'NEW', label: t('book.tabNewShort'), icon: <UserPlus className="h-3.5 w-3.5 shrink-0" /> },
                      ]}
                    />
                  </div>
                )}
              </div>

              {selected ? (
                patientCard
              ) : patientTab === 'EXISTING' ? (
                <div ref={patientBox} className="h-[4.75rem]">
                  <Combobox
                    query={patientQuery}
                    onQueryChange={setPatientQuery}
                    items={patientItems}
                    onSelect={(it) => { const pt = patientResults.find((x) => x.id === it.id); if (pt) choosePatient(pt); }}
                    placeholder={t('reception.searchPatient')}
                    loading={patLoading}
                    minChars={2}
                    emptyText={t('reception.noResults')}
                    leftIcon={<Icon name="search" className="h-4 w-4" />}
                  />
                  <p className="mt-2 truncate text-xs text-subtle">{t('book.searchHint')}</p>
                </div>
              ) : (
                /* A number typed into the search that found nobody is almost
                   always the new patient's own — carried over, not asked twice. */
                <AddPatientForm
                  framed={false}
                  initialMobile={/^0\d{0,10}$/u.test(patientQuery.trim()) ? patientQuery.trim() : ''}
                  onCreated={(pt) => { choosePatient(pt); toast('success', pt.mrNo); }}
                  onUseExisting={(pt) => choosePatient(pt)}
                  onCancel={() => setPatientTab('EXISTING')}
                  onMobileChange={setFormMobile}
                />
              )}

              {selected && dues && dues.total > 0 && (
                <div className="mt-2 flex h-6 min-w-0 items-center gap-2 text-xs text-warn-text" role="status">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                  <span
                    className="min-w-0 truncate font-semibold"
                    title={t('reception.duesSlips').replace('{slips}', dues.invoices.map((i) => `#${i.slipNo}`).join(', '))}
                  >
                    {t('reception.duesTitle').replace('{amount}', formatPkr(dues.total))}
                  </span>
                  <a href={`/billing?invoice=${dues.invoices[0].invoiceId}`} className="ms-auto shrink-0 font-semibold underline underline-offset-2">
                    {t('reception.duesCollect')}
                  </a>
                </div>
              )}

              <H className="mt-6 border-t border-line pt-6" icon={ClipboardList}>{t('book.visit')}</H>
              <FormGrid>
                {f['booking.referringDoctor'] && (<>
                  <FormLabel>{t('book.referredBy')}</FormLabel>
                  <div className="flex min-w-0 gap-2">
                    <Select
                      value={doctorId}
                      onChange={setDoctorId}
                      placeholder={t('common.none')}
                      className="min-w-0 flex-1"
                      options={[{ value: '', label: t('common.none') }, ...doctors.map((d) => ({ value: d.id, label: d.name }))]}
                    />
                    <button
                      type="button"
                      onClick={() => { setAddingDoctor((a) => !a); setDocError(null); }}
                      aria-label={t('reception.addDoctor')}
                      title={t('reception.addDoctor')}
                      aria-expanded={addingDoctor}
                      className="grid w-11 shrink-0 place-items-center self-stretch rounded-xl bg-brand-500/10 text-brand-600 transition-colors hover:bg-brand-500/20 dark:text-brand-300"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {addingDoctor && (<>
                    <span aria-hidden />
                    <div className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
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
                      </div>
                      {docError && <p className="text-sm text-danger-text"><Tr text={docError} /></p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveDoctor} loading={docSaving} disabled={docName.trim().length < 2}>
                          {t('reception.addDoctorSave')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAddingDoctor(false)}>{t('common.cancel')}</Button>
                      </div>
                    </div>
                  </>)}
                </>)}

                <FormLabel>{t('book.sample')}</FormLabel>
                <Select
                  value={sampleSource}
                  onChange={(v) => setSampleSource(v as typeof sampleSource)}
                  options={sampleOptions}
                />

                {f['booking.reportDue'] && (<>
                  <FormLabel htmlFor="report-due" hint={t('book.dueWhenEmpty')}>{t('reception.reportDue')}</FormLabel>
                  <DatePicker
                    id="report-due"
                    withTime
                    value={reportDue}
                    onChange={setReportDue}
                    min={new Date().toLocaleDateString('en-CA')}
                    placeholder={t('book.dueWhenEmptyShort')}
                    title={t('reception.reportDueHint')}
                  />
                </>)}

                {showCP && (<>
                  <FormLabel>{t('reception.collectionPoint')}</FormLabel>
                  <Select
                    value={collectionPointId}
                    onChange={(v) => {
                      setCollectionPointId(v);
                      const cp = collectionPoints.find((x) => x.id === v);
                      if (cp?.rateGroupId) choosePriceList(cp.rateGroupId);
                    }}
                    options={[{ value: '', label: t('reception.noCollectionPoint') }, ...collectionPoints.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </>)}

                {showB2B && (<>
                  <FormLabel>{t('reception.bookedFor')}</FormLabel>
                  <Select
                    value={partnerId}
                    onChange={(v) => {
                      setPartnerId(v);
                      const pl = partners.find((x) => x.id === v);
                      if (pl?.rateGroupId) choosePriceList(pl.rateGroupId);
                    }}
                    options={[{ value: '', label: t('reception.walkIn') }, ...partners.map((x) => ({ value: x.id, label: x.name }))]}
                  />
                  {partnerId && (<>
                    <FormLabel htmlFor="b2b-no">{t('reception.b2bNo')}</FormLabel>
                    <input id="b2b-no" value={b2bNo} onChange={(e) => setB2bNo(e.target.value)} maxLength={40} className="field" />
                  </>)}
                </>)}

                {f['booking.comments'] && (<>
                  <FormLabel htmlFor="booking-notes" hint={t('book.staffOnly')}>{t('reception.notes')}</FormLabel>
                  <div className="relative">
                    <input
                      id="booking-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={500}
                      placeholder={t('reception.notesPlaceholder')}
                      title={t('reception.notesHint')}
                      className="field pe-16"
                    />
                    <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-subtle">
                      {notes.length}/500
                    </span>
                  </div>
                </>)}
              </FormGrid>
            </>) : (<>
              {/* At billing the tests column moves here: the patient's card takes
                  the place of the test search, and the tests with their prices
                  and the family card stay under it, as they were. */}
              <div className="mb-3 flex h-10 items-center">
                <H className="mb-0" icon={UserRound}>{t('reception.patient')}</H>
              </div>
              {patientCard}
              {selected && dues && dues.total > 0 && (
                <div className="mt-2 flex h-6 min-w-0 items-center gap-2 text-xs text-warn-text" role="status">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                  <span
                    className="min-w-0 truncate font-semibold"
                    title={t('reception.duesSlips').replace('{slips}', dues.invoices.map((i) => `#${i.slipNo}`).join(', '))}
                  >
                    {t('reception.duesTitle').replace('{amount}', formatPkr(dues.total))}
                  </span>
                  <a href={`/billing?invoice=${dues.invoices[0].invoiceId}`} className="ms-auto shrink-0 font-semibold underline underline-offset-2">
                    {t('reception.duesCollect')}
                  </a>
                </div>
              )}
            </>)}

            {step === 1 && (<>
              <div className="mt-6 flex items-center border-t border-line pt-6">
                <H className="mb-0" icon={FlaskConical}>{t('reception.tests')}</H>
              </div>
              {testsList}
              <div className={cn('mt-5 lg:mt-auto lg:pt-5', cartEmpty && 'invisible')} aria-hidden={cartEmpty}>{discountSection}</div>
            </>)}
          </div>

          <div className="flex min-w-0 flex-col lg:border-s lg:border-line lg:ps-8">
            {step === 0 ? (<>
              <div className="mb-3 flex h-10 items-center">
                <H className="mb-0" icon={FlaskConical}>{t('reception.tests')}</H>
              </div>
              <div className="flex gap-2">
                <div ref={testBox} className="min-w-0 flex-1">
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
                {f['booking.packages'] && packages.some((pk) => !cartPackages.some((x) => x.id === pk.id)) && (
                  <Select
                    value=""
                    onChange={addPackage}
                    placeholder={t('book.packagesShort')}
                    className="w-36 shrink-0"
                    menuWidth={360}
                    options={packages
                      .filter((pk) => !cartPackages.some((x) => x.id === pk.id))
                      .map((pk) => ({
                        value: pk.id,
                        label: pk.name,
                        hint: `${formatPkr(pk.price)} · ${t('reception.packageTests').replace('{n}', String(pk.tests.length))} — ${pk.tests.map((x) => x.name).join(', ')}`,
                      }))}
                  />
                )}
              </div>

              {/* Often booked, as pills with their price, on one line that
                  scrolls sideways rather than wraps. The line is held while the
                  list loads, so nothing below it jumps. */}
              {f['booking.quickPicks'] && (
                <div className="mt-3 flex h-8 items-center gap-1.5 overflow-x-auto overflow-y-hidden" style={NO_SCROLLBAR}>
                  {!(pickerReady && (!selected || lastVisitFor === selected.id)) ? (
                    <div className="skeleton h-7 w-2/3 rounded-full" aria-hidden />
                  ) : (<>
                    <span className="me-1 shrink-0 text-xs text-subtle">{t('reception.common')}</span>
                    {lastVisit && lastVisitNew && (
                      <button
                        type="button"
                        onClick={() => addToCart(lastVisit.tests)}
                        title={lastVisit.tests.map((x) => x.name).join(', ')}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-500/10 px-3 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-500/20 dark:text-brand-300"
                      >
                        <RotateCcw className="h-3 w-3" /> {t('reception.repeatLast').replace('{date}', shortDate(lastVisit.bookedAt))}
                      </button>
                    )}
                    {popularShown.map((pp) => (
                      <button
                        key={pp.id}
                        type="button"
                        onClick={() => addToCart([pp])}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 text-xs font-semibold text-body transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-300"
                      >
                        <Plus className="h-3 w-3" /> {pp.name}
                        <span className="font-medium tabular-nums text-muted">{formatPkr(pp.price).replace('Rs ', '')}</span>
                      </button>
                    ))}
                  </>)}
                </div>
              )}

              {testsList}

              {/* The family card under the prices it changes — with its price
                  check switch before anyone is registered. */}
              <div className={cn('mt-5 lg:mt-auto lg:pt-5', cartEmpty && 'invisible')} aria-hidden={cartEmpty}>{discountSection}</div>
            </>) : (<>
              <div>
                <div className="mb-3 flex h-10 items-center justify-between gap-3">
                  <H className="mb-0" icon={ReceiptText}>{t('book.bill')}</H>
                  {f['booking.priceLists'] && counterGroups.length > 0 && (rateGroupId === '' || counterGroups.some((g) => g.id === rateGroupId)) && (
                    <Select
                      value={rateGroupId}
                      onChange={choosePriceList}
                      className="w-44"
                      options={[{ value: '', label: t('reception.standardPrices') }, ...counterGroups.map((g) => ({ value: g.id, label: g.name }))]}
                    />
                  )}
                </div>
                {rateGroupId && !(f['booking.priceLists'] && counterGroups.some((g) => g.id === rateGroupId)) && (
                  <p className="mb-2 truncate text-xs text-muted">{t('book.priceListFrom').replace('{name}', rateGroups.find((g) => g.id === rateGroupId)?.name ?? '')}</p>
                )}

                <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-line/60">
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{testCount === 1 ? t('book.oneTest') : t('book.nTests').replace('{n}', String(testCount))}</dt>
                      <dd className="font-semibold tabular-nums text-strong">{formatPkr(total)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">
                        {cardApplies
                          ? `${t('book.familyCard')} ${effectivePct}%`
                          : manualAmount > 0
                            ? `${t('reception.discManual')}${manualType === 'PERCENT' ? ` ${Math.min(manualNum, 100)}%` : ''}`
                            : t('reception.discount')}
                      </dt>
                      <dd className={cn('font-semibold tabular-nums', discountAmount > 0 ? 'text-ok-text' : 'text-subtle')}>− {formatPkr(discountAmount)}</dd>
                    </div>
                    {/* The card fee line is always there, at Rs 0 until a card is
                        issued, so choosing one does not push the payment down. */}
                    {f['booking.familyCards'] && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('reception.cardFee')}</dt>
                        <dd className={cn('font-semibold tabular-nums', feeCharged > 0 ? 'text-strong' : 'text-subtle')}>+ {formatPkr(feeCharged)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                    <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{t('reception.net')}</span>
                    <span className="text-[1.75rem] font-extrabold leading-none tracking-tight tabular-nums text-strong">{formatPkr(net)}</span>
                  </div>
                </div>

                {billedToPartner && partner && (
                  <p className="mt-5 text-sm font-medium text-info-text">{t('reception.billedToPartner').replace('{name}', partner.name)}</p>
                )}

              </div>

              {f['booking.payAtCounter'] && net > 0 && !billedToPartner && (
                <div className="mt-4 border-t border-line pt-4">
                  <div className="mb-2.5 flex h-9 items-center justify-between gap-3">
                    <H className="mb-0" icon={Wallet}>{t('pay.title')}</H>
                    <div className="w-44">
                      <Segmented
                        size="sm"
                        value={payNow}
                        onChange={setPayNow}
                        ariaLabel={t('pay.title')}
                        options={[{ value: 'NOW', label: t('pay.now') }, { value: 'LATER', label: t('pay.later') }]}
                      />
                    </div>
                  </div>
                  {payNow === 'LATER' ? (
                    <p className="text-sm text-muted">{t('book.payLaterBody').replace('{amount}', formatPkr(net))}</p>
                  ) : (<>
                    <FormGrid>
                      {accounts.length > 1 && (<>
                        <FormLabel>{t('reception.account')}</FormLabel>
                        {accounts.length <= 4 ? (
                          <Segmented
                            size="sm"
                            value={accountId}
                            onChange={setAccountId}
                            ariaLabel={t('reception.account')}
                            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                          />
                        ) : (
                          <Select value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
                        )}
                      </>)}
                      <FormLabel htmlFor="pay-received">{t('pay.received')}</FormLabel>
                      <div className="field flex items-center gap-2 py-0 ps-3.5">
                        <span className="shrink-0 text-sm font-bold text-subtle">Rs</span>
                        <input
                          id="pay-received"
                          type="number"
                          min={0}
                          inputMode="decimal"
                          value={receivedTouched ? received : String(net)}
                          onChange={(e) => { setReceivedTouched(true); setReceived(e.target.value); }}
                          className="field-inner py-2 text-base font-semibold tabular-nums"
                        />
                      </div>
                    </FormGrid>
                    {/* "Give back Rs 215 change": the sum inside the sentence, large
                        enough to read across the counter. Always drawn, so typing
                        never moves the form. */}
                    <div
                      aria-live="polite"
                      className={cn('mt-4 flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold',
                        changeDue > 0 ? 'bg-ok-soft text-ok-text' : stillDue > 0 ? 'bg-warn-soft text-warn-text' : 'bg-surface-2 text-muted')}
                    >
                      {changeDue > 0 ? <Sentence text={t('pay.change')} amount={formatPkr(changeDue)} />
                        : stillDue > 0 ? <Sentence text={t('pay.remaining')} amount={formatPkr(stillDue)} />
                        : t('pay.exact')}
                    </div>
                  </>)}
                </div>
              )}
            </>)}
          </div>
        </div>
      </div>

      {error && <p className="animate-fade-in rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text"><Tr text={error} /></p>}

      {/* Who and how much, and the one way forward: always in reach. */}
      <div className="sticky bottom-20 z-10 md:bottom-4">
        <div className="flex items-center gap-3 rounded-2xl bg-surface/95 p-2.5 shadow-card ring-1 ring-line/60 backdrop-blur-md sm:gap-4 sm:px-4">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> <span className="hidden sm:inline">{t('book.back')}</span>
            </Button>
          )}
          <div className="min-w-0 flex-1 ps-1">
            <div className="truncate text-sm font-semibold leading-5 text-strong">{selected?.fullName ?? t('book.noPatientYet')}</div>
            <div className="truncate text-xs leading-4 text-muted">
              {cartEmpty ? t('reception.noTests') : (<>
                <span>{testCount === 1 ? t('book.oneTest') : t('book.nTests').replace('{n}', String(testCount))}</span>
                <span aria-hidden> · </span>
                {barNet < total && <span className="me-1 tabular-nums line-through opacity-60">{formatPkr(total)}</span>}
                <span className="font-semibold tabular-nums text-body">{formatPkr(barNet)}</span>
                {barNote && (<>
                  <span aria-hidden> · </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300">{barNote}</span>
                </>)}
              </>)}
            </div>
          </div>
          {step === 0 ? (
            <Button onClick={() => setStep(1)} disabled={!canReach(1)}>
              {t('book.next')} <span className="hidden font-medium opacity-75 sm:inline">· {t('book.stepBilling')}</span> <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          ) : (
            <Button onClick={book} loading={isPending} disabled={!selected || cartEmpty} title="Ctrl+Enter">
              <Icon name="print" className="h-4 w-4" /> {t('reception.save')}
            </Button>
          )}
        </div>
        {/* Always a line here, so the bar never moves when it changes. */}
        <p className="mt-1.5 h-4 truncate text-center text-xs text-subtle">
          {step === 0 && !canReach(1)
            ? (!selected && !cartEmpty ? t('book.priceCheck') : !selected ? t('book.needPatient') : t('book.needTests'))
            : ' '}
        </p>
      </div>
    </div>
  );
}

/** One-line rows that scroll sideways do it without a visible bar. Inline, because
 *  the app's stylesheet gives every element a thin scrollbar and outranks a class. */
const NO_SCROLLBAR = { scrollbarWidth: 'none' } as const;

/** The icons a lab's ways of taking a sample go by, on the sample switch. */
/** A group's small heading on the sheet — the only thing marking the group. */
function H({ children, className, icon: I }: { children: React.ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <h2 className={cn('mb-3 flex items-center gap-2.5 text-[15px] font-bold text-strong', className)}>
      {I && (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
          <I className="h-4 w-4" />
        </span>
      )}
      {children}
    </h2>
  );
}

/** Labels in one column, fields in the next, every field starting on one line. */
function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]', className)}>
      {children}
    </div>
  );
}

/** A row's label, with an optional second line saying what empty means. */
function FormLabel({ children, htmlFor, hint }: { children: React.ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="min-w-0 text-sm text-muted">
      <span className="block truncate">{children}</span>
      {hint && <span className="block truncate text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

/**
 * Where the booking is, as two small icons before the title: the current step
 * filled, a finished one ticked. They are not buttons — Continue moves on.
 */
function StepIcons({ step }: { step: number }) {
  const { t } = useI18n();
  const tile = (i: number, IconC: LucideIcon, label: string) => {
    const state = i === step ? 'on' : i < step ? 'done' : 'next';
    return (
      <span
        role="img"
        aria-label={`${label}${state === 'on' ? ` · ${t('book.currentStep')}` : state === 'done' ? ` · ${t('book.stepDone')}` : ''}`}
        title={label}
        className={cn('grid h-8 w-8 place-items-center rounded-[10px] transition-colors',
          state === 'on' ? 'bg-brand-600 text-white shadow-sm'
            : state === 'done' ? 'text-ok-text'
            : 'bg-surface-2 text-subtle')}
      >
        {state === 'done' ? <Check className="h-4 w-4" /> : <IconC className="h-4 w-4" />}
      </span>
    );
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      {tile(0, ClipboardList, t('book.stepBooking'))}
      <span aria-hidden className={cn('h-0.5 w-3 rounded-full', step > 0 ? 'bg-ok-text/50' : 'bg-line-strong')} />
      {tile(1, ReceiptText, t('book.stepBilling'))}
    </span>
  );
}

/** One of the two family-card choices, as a tile: a radio, what it is, what it costs. */
function CardChoice({
  selected, onSelect, title, sub, cost,
}: { selected: boolean; onSelect: () => void; title: string; sub: string; cost: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      title={sub}
      className={cn(
        'flex min-w-0 items-start gap-2.5 rounded-lg px-3 py-2 text-start ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        selected ? 'bg-brand-500/10 ring-brand-500/50' : 'bg-surface ring-line hover:ring-line-strong',
      )}
    >
      <span
        aria-hidden
        className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition-colors',
          selected ? 'border-brand-600 dark:border-brand-400' : 'border-line-strong')}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full bg-brand-600 transition-transform dark:bg-brand-400', selected ? 'scale-100' : 'scale-0')} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-strong">{title}</span>
        <span className={cn('block truncate text-xs font-medium', selected ? 'text-brand-700 dark:text-brand-300' : 'text-muted')}>{cost}</span>
      </span>
    </button>
  );
}

/** Remove a test from the booking: a bin at the end of its row, red on hover. */
function RowDelete({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-lg text-subtle ring-1 ring-line transition-colors hover:bg-danger-soft hover:text-red-600 hover:ring-red-500/30"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** "Give back {amount} change", with the amount set large inside the sentence. */
function Sentence({ text, amount }: { text: string; amount: string }) {
  const [before = '', after = ''] = text.split('{amount}');
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {before.trim() && <span>{before.trim()}</span>}
      <span className="text-lg font-extrabold tabular-nums">{amount}</span>
      {after.trim() && <span>{after.trim()}</span>}
    </span>
  );
}

/** What reception can do with the card, in words, and the colour that goes with it. */
function cardStatus(hint: FamilyCardHintDTO, t: (key: string) => string): { status: React.ReactNode; statusCls: string } {
  if (!hint.usable) return { status: t('book.cardInactive'), statusCls: 'text-danger-text' };
  if (hint.onThisCard) return { status: t('book.cardMember'), statusCls: 'text-ok-text' };
  if (hint.canJoin === true) return { status: t('book.cardCanJoin'), statusCls: 'text-ok-text' };
  if (hint.canJoin === false) {
    return { status: hint.reason ? <Tr text={hint.reason} /> : t('book.cardCannotJoin'), statusCls: 'text-danger-text' };
  }
  return { status: t('book.cardSaveFirst'), statusCls: 'text-amber-900 dark:text-amber-200' };
}

