'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, BadgePercent, CalendarClock, Check, CircleAlert, CreditCard, Keyboard, MessageSquareText, Package, Plus, RotateCcw, Search, StickyNote, UserPlus, Users, type LucideIcon } from 'lucide-react';
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
  const f = useFeatures();

  // Booking goes step by step — patient, tests, sample, billing — so each screen
  // asks one thing, instead of every option at once on one long page.
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
  const [cardPolicy, setCardPolicy] = useState({ fee: 0, discountPct: 0, discountOnIssue: true });

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
  /** A step opens once the ones before it have what they need: a patient, then a test. */
  const canReach = (i: number) => i === 0 || (i === 1 ? !!selected : !!selected && !cartEmpty);
  // Choosing the patient only moves on by itself when nothing else is asked on
  // this step. With referring doctors on, the doctor is chosen here first.
  const choosePatient = (p: PatientDTO) => { setSelected(p); if (!f['booking.referringDoctor']) setStep(1); };
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
  // What someone pays Rs 510 with: the next note up, and the one after it.
  const cashNotes = [500, 1000, 2000, 5000].filter((n) => n > net).slice(0, 2);

  // Struck only when the patient really pays less than the tests come to — a
  // card's joining fee can push the bill the other way, and a struck figure
  // above a higher one would be a lie.
  const saving = net < total ? total - net : 0;
  // A card that is doing something is named; one merely sitting on the number
  // is offered. Anything else (a manual discount) needs no note here.
  const cardNote = cardApplies
    ? t('book.cardSaving').replace('{pct}', String(effectivePct))
    : cardHint?.usable && !cardApplies
      ? t('book.cardOffer').replace('{pct}', String(cardHint.discountPct))
      : null;
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

  // Ctrl+Enter moves on a step, and books on the last one.
  const bookRef = useRef(book);
  bookRef.current = () => {
    if (step < 3) { if (canReach(step + 1)) setStep(step + 1); } else book();
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
        setStep((s) => (s === 0 ? s : 1));
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

  const STEPS = ['PATIENT', 'TESTS', 'SAMPLE', 'BILLING'] as const;
  const summaries = [
    selected?.fullName ?? null,
    cartEmpty ? null : `${(testCount === 1 ? t('book.oneTest') : t('book.nTests').replace('{n}', String(testCount)))} · ${formatPkr(total)}`,
    step > 2 ? t(`sample.${sampleSource}`) : null,
    step === 3 ? formatPkr(net) : null,
  ];
  const done = [!!selected, !cartEmpty, step > 2, false];

  return (
    <div className="page">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('reception.title')}</h1>
        <p className="hidden items-center gap-3 text-xs text-subtle lg:flex">
          <Keyboard className="h-3.5 w-3.5 self-center" aria-hidden />
          <span><kbd className={kbd}>Alt+P</kbd> {t('shortcut.patient')}</span>
          <span><kbd className={kbd}>Alt+T</kbd> {t('shortcut.test')}</span>
          <span><kbd className={kbd}>Ctrl+Enter</kbd> {t('book.shortcutNext')}</span>
        </p>
      </div>

      {/* Where the booking is. A finished step shows what was chosen, and any
          step whose earlier steps are complete can be opened directly. */}
      <nav aria-label={t('book.progress')} className="card p-1.5">
        <ol className="grid grid-cols-4 gap-1">
          {STEPS.map((s, i) => {
            const current = i === step;
            const reachable = canReach(i);
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(i)}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center justify-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors sm:justify-start',
                    current ? 'bg-brand-500/10' : reachable ? 'hover:bg-surface-2' : 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                      current ? 'bg-brand-600 text-white' : done[i] ? 'bg-ok-soft text-ok-text' : 'bg-surface-3 text-muted',
                    )}
                  >
                    {done[i] && !current ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className={cn('block text-sm font-semibold', current ? 'text-brand-700 dark:text-brand-300' : 'text-body')}>{t(`book.step.${s}`)}</span>
                    <span className="block truncate text-xs text-subtle">{summaries[i] ?? t(`book.stepHint.${s}`)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="px-2.5 pb-1 pt-1.5 text-sm font-semibold text-strong sm:hidden">
          {t('book.stepOf').replace('{n}', String(step + 1))} · {t(`book.step.${STEPS[step]}`)}
        </p>
      </nav>

      <div className="mx-auto w-full max-w-3xl space-y-4">
        {step === 0 && (
          <>
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
                        onSelect={(it) => { const p = patientResults.find((x) => x.id === it.id); if (p) choosePatient(p); }}
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
                        onCreated={(p) => { choosePatient(p); toast('success', p.mrNo); }}
                        onUseExisting={(p) => choosePatient(p)}
                        onCancel={() => setPatientTab('EXISTING')}
                        onMobileChange={setFormMobile}
                      />
                    )}
                  </div>
                </>
              )}
            </Card>

            {f['booking.referringDoctor'] && (<Card className="p-5">
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
            </Card>)}
          </>
        )}

        {step === 1 && (
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

            {!(pickerReady && (!selected || lastVisitFor === selected.id)) ? (
              <div className="mt-3 space-y-2" aria-hidden>
                <div className="skeleton h-11 w-full rounded-xl" />
                <div className="skeleton h-7 w-2/3 rounded-full" />
              </div>
            ) : (<>
            {f['booking.packages'] && packages.some((p) => !cartPackages.some((x) => x.id === p.id)) && (
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

            {f['booking.quickPicks'] && (lastVisitNew || popularShown.length > 0) && (
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
            </>)}

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
                        {f['booking.testNotes'] && (<button
                          type="button"
                          onClick={() => setNoteOpen(noteOpen === c.id ? null : c.id)}
                          className={cn('order-first flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-surface-3',
                            testRemarks[c.id]?.trim() ? 'text-brand-600 dark:text-brand-300' : 'text-subtle')}
                          aria-label={t('reception.testNote')}
                          title={t('reception.testNote')}
                        ><StickyNote className="h-3.5 w-3.5" /></button>)}
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
        )}

        {step === 2 && (
          <>
            {sampleOptions.length > 1 || f['booking.reportDue'] || showCP || showB2B ? (
            <Card className="space-y-4 p-5">
              <div className="section-title flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" /> {t('reception.collection')}
              </div>
              <div>
                {sampleOptions.length > 1 && (<>
                  <span className="label">{t('reception.sampleSource')}</span>
                  <Segmented size="sm" value={sampleSource} onChange={setSampleSource} ariaLabel={t('reception.sampleSource')} options={sampleOptions} />
                </>)}
                {f['booking.reportDue'] && (<>
                <label className="label mt-3" htmlFor="report-due">{t('reception.reportDue')}</label>
                <input
                  id="report-due"
                  type="datetime-local"
                  value={reportDue}
                  onChange={(e) => setReportDue(e.target.value)}
                  className="field"
                />
                <p className="mt-1.5 text-xs text-subtle">{t('reception.reportDueHint')}</p>
                </>)}
              </div>
              {(showCP || showB2B) && (
                <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  {showCP && (
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
              {showB2B && (
                <div className="contents">
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
                </div>
              )}
            </Card>
            ) : (
              <Card className="p-5 text-sm text-muted">{t('book.sampleNothing').replace('{source}', t(`sample.${sampleSource}`))}</Card>
            )}

            {f['booking.comments'] && (<Card className="p-5">
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
            </Card>)}
          </>
        )}

        {step === 3 && (
          <>
            <Card className="space-y-4 p-5">
              <div className="section-title">{t('reception.billing')}</div>
              {f['booking.priceLists'] && counterGroups.length > 0 && (rateGroupId === '' || counterGroups.some((g) => g.id === rateGroupId)) && (
                <div>
                  <span className="label">{t('reception.priceList')}</span>
                  <Select
                    value={rateGroupId}
                    onChange={choosePriceList}
                    options={[{ value: '', label: t('reception.standardPrices') }, ...counterGroups.map((g) => ({ value: g.id, label: g.name }))]}
                  />
                </div>
              )}
              {rateGroupId && !(f['booking.priceLists'] && counterGroups.some((g) => g.id === rateGroupId)) && (
                <p className="text-sm text-muted">{t('book.priceListFrom').replace('{name}', rateGroups.find((g) => g.id === rateGroupId)?.name ?? '')}</p>
              )}
              {/*
                Two questions, asked in order. First: is there a discount at all?
                Most slips have none, so that is a switch which is off, and the
                whole apparatus stays folded away behind it. Only then: on what
                basis — a family card the patient holds, or someone's authority.

                There is deliberately no free-typed amount any more. A number
                bounded only by the bill, recorded against nobody, was the one
                discount nobody could answer for afterwards.
              */}
              {discountsOn && (<div>
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
                  <div className="rounded-xl border border-ok-line bg-ok-soft px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-ok-text">
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span className="font-semibold">{ownCard.discountPct}% {t('reception.cardApplied')}</span>
                      <span className="font-mono text-xs opacity-75">{ownCard.mobile}</span>
                    </div>
                    {/* The whole discount apparatus disappears for a card holder,
                        which reads as a missing feature unless the reason is said.
                        It is the rule from billing/discount: the card is final. */}
                    <p className="mt-1 text-xs text-ok-text/75">{t('reception.cardFinal')}</p>
                  </div>
                ) : discountOn ? (
                  <div className="mt-2.5">
                    {f['booking.familyCards'] && f['booking.manualDiscount'] && (
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
                    )}

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
{/* Two long sentences do not fit in a segmented control's slot: squeezed
                            into one they wrapped to a 24px line of 11px text that read as
                            neither a tab nor a choice. Each option is its own card now, with
                            room to say what picking it does and what it costs. */}
                        <div role="radiogroup" aria-label={t('familyCard.title')} className="grid gap-2 sm:grid-cols-2">
                          <CardChoice
                            selected={cardMode === 'JOIN'}
                            onSelect={() => setCardMode('JOIN')}
                            icon={Users}
                            title={t('reception.cardJoin')}
                            sub={t('reception.cardJoinWhat')}
                          />
                          <CardChoice
                            selected={cardMode === 'CREATE'}
                            onSelect={() => setCardMode('CREATE')}
                            icon={CreditCard}
                            title={t('reception.cardCreate')}
                            sub={t('reception.cardCreateWhat')
                              .replace('{fee}', formatPkr(cardPolicy.fee))
                              .replace('{pct}', String(cardPolicy.discountPct))}
                          />
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
                            {/* The status line and the relation picker are always drawn, so a
                                lookup finishing never moves the form under the cursor. */}
                            <p className={cn('mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5 text-sm',
                              joinInfo?.found && joinInfo.canJoin ? 'text-ok-text' : joinInfo ? 'text-danger-text' : 'text-subtle')}>
                              {joinInfo?.found && joinInfo.canJoin ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  <span className="font-semibold">{joinInfo.holderName}</span>
                                  <span>· {joinInfo.discountPct}%</span>
                                  <span className="text-subtle">
                                    · {joinInfo.used}/{joinInfo.cap} {t('familyCard.slotsUsed')}
                                  </span>
                                </>
                              ) : joinInfo ? (joinInfo.reason ?? t('reception.cardNotFound')) : t('reception.cardJoinHint')}
                            </p>
                            {joinPrefilled && joinMobile === foundCardMobile && (
                              <p className="mt-1 text-xs text-muted">{t('reception.cardJoinPrefilled')}</p>
                            )}
                            {/* Who they are to the holder is what justifies the discount,
                                so it is asked at the moment of joining. */}
                            <div className="mt-2">
                              <span className="label">
                                {joinInfo?.found && joinInfo.canJoin
                                  ? t('reception.relationTo').replace('{name}', joinInfo.holderName ?? '')
                                  : t('reception.relationToHolder')}
                              </span>
                              <Select
                                value={joinRelation}
                                onChange={(v) => setJoinRelation(v as Relation)}
                                disabled={!(joinInfo?.found && joinInfo.canJoin)}
                                options={MEMBER_RELATIONS.map((r) => ({
                                  value: r,
                                  label: t(`relation.${r}`),
                                }))}
                              />
                            </div>
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
            {/* Always drawn, so a clash appearing never shifts the total below it. */}
                            <p className={cn('mt-1.5 min-h-5 text-sm', newCardClash ? 'text-danger-text' : 'text-muted')}>
                              {newCardClash
                                ? t('reception.cardNumberTaken').replace('{name}', newCardClash.holderName ?? '')
                                : t('reception.cardCreateHint')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>)}
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

              {f['booking.payAtCounter'] && net > 0 && !billedToPartner && (
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
                        {/* The notes a patient actually hands over. They are here to be
                            tapped, but mostly they are here to be seen: the change line
                            below was a feature nobody knew about until they happened to
                            type an amount larger than the bill. */}
                        {payMethod === 'CASH' && (
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setReceivedTouched(true); setReceived(String(net)); }}
                              className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                                receivedAmount === net
                                  ? 'border-brand-600 bg-brand-600 text-white'
                                  : 'border-line bg-surface text-body hover:border-brand-300 hover:text-strong')}
                            >
                              {t('pay.exactShort')} · {formatPkr(net)}
                            </button>
                            {cashNotes.map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => { setReceivedTouched(true); setReceived(String(n)); }}
                                className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors',
                                  receivedAmount === n
                                    ? 'border-brand-600 bg-brand-600 text-white'
                                    : 'border-line bg-surface text-body hover:border-brand-300 hover:text-strong')}
                              >
                                {formatPkr(n)}
                              </button>
                            ))}
                          </div>
                        )}
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
                        {/* The sum the cashier would otherwise do in their head, said as
                            a figure and not as a sentence: at a counter it is read at a
                            glance, across a desk, while counting notes. Always there, in
                            the same place, so typing never moves the form. */}
                        <div
                          className={cn('mt-2 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5',
                            changeDue > 0 ? 'bg-ok-soft' : stillDue > 0 ? 'bg-warn-soft' : 'bg-surface-2')}
                          aria-live="polite"
                        >
                          <span className="min-w-0">
                            <span className={cn('block text-[11px] font-bold uppercase tracking-wider',
                              changeDue > 0 ? 'text-ok-text' : stillDue > 0 ? 'text-warn-text' : 'text-subtle')}>
                              {changeDue > 0 ? t('pay.changeLabel') : stillDue > 0 ? t('pay.remainingLabel') : t('pay.exactLabel')}
                            </span>
                            {changeDue === 0 && stillDue === 0 && (
                              <span className="block text-xs text-muted">{t('pay.exactNote')}</span>
                            )}
                          </span>
                          <span className={cn('shrink-0 text-xl font-extrabold tabular-nums',
                            changeDue > 0 ? 'text-ok-text' : stillDue > 0 ? 'text-warn-text' : 'text-subtle')}>
                            {formatPkr(changeDue > 0 ? changeDue : stillDue > 0 ? stillDue : net)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {error && <p className="animate-fade-in rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text"><Tr text={error} /></p>}

        {/* Always in reach: who and how much, and the way forward — and above it
            what reception must not miss about this patient: a family card, money
            still owed. They live in this pinned stack rather than above the form,
            so they stay in view on every step and never push what is being
            filled in when a lookup comes back. */}
        <div className="sticky bottom-20 z-10 space-y-2 md:bottom-4">
          {/* One card indicator per step, always in view: the detailed banner on the
              Patient step, where the card is discovered; the chip beside the name
              in this bar on every step after it. */}
          {cardHint && step === 0 && <FamilyCardBanner hint={cardHint} patientName={selected?.fullName ?? null} />}
          {selected && dues && dues.total > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn-line bg-warn-soft px-4 py-2.5 text-warn-text shadow-card" role="status">
              <CircleAlert className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t('reception.duesTitle').replace('{amount}', formatPkr(dues.total))}</div>
                <div className="truncate text-xs opacity-80">
                  {t('reception.duesSlips').replace('{slips}', dues.invoices.map((i) => `#${i.slipNo}`).join(', '))}
                </div>
              </div>
              <a href={`/billing?invoice=${dues.invoices[0].invoiceId}`} className="shrink-0 text-sm font-semibold underline underline-offset-2">
                {t('reception.duesCollect')}
              </a>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-card backdrop-blur-md sm:gap-3 sm:p-3">
          <div className="min-w-0 flex-1 ps-1">
            <div className="truncate text-sm font-semibold leading-5 text-strong">{selected?.fullName ?? t('book.noPatientYet')}</div>
            {/* The card is carried by the price it changes, not by a badge
                competing with the buttons: the old figure struck through, the
                new one beside it, and what did that in three words. A pill here
                set the line height and crowded everything around it. */}
            <div className="truncate text-xs leading-4 text-muted">
              {cartEmpty ? t('reception.noTests') : (<>
                <span>{testCount === 1 ? t('book.oneTest') : t('book.nTests').replace('{n}', String(testCount))}</span>
                <span aria-hidden> · </span>
                {saving > 0 && (
                  <span className="me-1 tabular-nums line-through opacity-60">{formatPkr(total)}</span>
                )}
                <span className="font-semibold tabular-nums text-body">{formatPkr(net)}</span>
                {cardNote && (
                  <>
                    <span aria-hidden> · </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                      <span aria-hidden className="me-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
                      {cardNote}
                    </span>
                  </>
                )}
              </>)}
            </div>
          </div>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> <span className="hidden sm:inline">{t('book.back')}</span>
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canReach(step + 1)}>
              {t('book.next')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          ) : (
            <Button onClick={book} loading={isPending} disabled={!selected || cartEmpty} title="Ctrl+Enter">
              <Icon name="print" className="h-4 w-4" /> {t('reception.save')}
            </Button>
          )}
          </div>
        </div>
        {step < 3 && !canReach(step + 1) && (
          <p className="text-center text-xs text-subtle">{step === 0 ? t('book.needPatient') : t('book.needTests')}</p>
        )}
      </div>
    </div>
  );
}

/**
 * A family card on the number this booking is about. Drawn as a gold card —
 * the one warm, saturated block on the screen — so it is seen at a glance and
 * not mistaken for the blue and amber notices around it.
 */
/**
 * One of two ways to give this patient a card rate. Drawn as a card and not a
 * tab because the two are not views of the same thing: one joins something
 * that exists, the other issues something new and charges for it.
 */
function CardChoice({
  selected, onSelect, icon: Icon, title, sub,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border p-3 text-start transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        selected
          ? 'border-brand-600 bg-brand-500/[0.07]'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', selected ? 'text-brand-600 dark:text-brand-300' : 'text-muted')} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-strong">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted">{sub}</span>
      </span>
      <Check className={cn('mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300', !selected && 'opacity-0')} />
    </button>
  );
}

function FamilyCardBanner({ hint, patientName }: { hint: FamilyCardHintDTO; patientName: string | null }) {
  const { t } = useI18n();

  const { status, statusCls } = cardStatus(hint, t);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex animate-fade-in-up items-center gap-3.5 rounded-2xl border border-amber-300 bg-surface bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-50 p-3 pe-4 shadow-card dark:border-amber-500/40 dark:from-amber-500/20 dark:via-amber-500/10 dark:to-amber-500/5"
    >
      <div className="relative grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md">
        <CreditCard className="h-6 w-6" />
        <span className="absolute -end-1 -top-1 flex h-3 w-3" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75 [animation-iteration-count:4] motion-reduce:animate-none" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500 ring-2 ring-surface" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold text-amber-950 dark:text-amber-100">
            {hint.onThisCard && patientName
              ? t('book.cardOnPatient').replace('{name}', patientName)
              : t('book.cardHeldBy').replace('{name}', hint.holderName)}
          </span>
          {/* The rate is only a fact for a member. For anyone else this number's
              card is an offer, and the pill has to say so — a bare "15% off"
              beside a stranger's name reads as a discount already applied. */}
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold',
            hint.onThisCard ? 'bg-amber-600 text-white' : 'border border-amber-600 text-amber-900 dark:border-amber-400/70 dark:text-amber-200')}>
            {t(hint.onThisCard ? 'book.cardPctOff' : 'book.cardPctIfJoin').replace('{pct}', String(hint.discountPct))}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-amber-900/80 dark:text-amber-200/80">
          <span className="font-mono font-semibold tabular-nums">{hint.mobile}</span>
          <span aria-hidden>·</span>
          <span>{hint.onThisCard
            ? t('book.cardHolder').replace('{name}', `${hint.holderName} (${hint.holderMrNo})`)
            : hint.holderMrNo}</span>
          <span aria-hidden>·</span>
          <span>{t('book.cardMembersUsed').replace('{used}', String(hint.used)).replace('{cap}', String(hint.cap))}</span>
        </div>
        <div className={cn('mt-1 text-xs font-semibold', statusCls)}>{status}</div>
      </div>
    </div>
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

