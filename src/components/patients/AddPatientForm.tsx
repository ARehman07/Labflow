'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, TriangleAlert, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { ageFromDob } from '@/lib/age';
import {
  createPatientAction,
  findSimilarPatientsAction,
  type PatientDTO,
  type SimilarPatientDTO,
} from '@/modules/reception/reception.actions';
import { Tr } from '@/components/ui/Tr';

/** Show a CNIC the way it is printed on the card: 35202-1234567-1. */
function formatCnic(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/**
 * Register a patient inline.
 *
 * Shared, because registering someone is not only a step in booking tests: a
 * walk-in may come in solely to buy a family card, and refusing to register
 * them until they order a test would be an artificial dead end.
 *
 * Carries the identity details a Pakistani lab records at the counter — CNIC,
 * date of birth, email — and an optional webcam photo, so the person drawing
 * blood can check they have the right patient.
 */
export function AddPatientForm({
  onCreated,
  onCancel,
  /** Prefill when the caller already knows the number, e.g. a failed lookup. */
  initialMobile = '',
  /**
   * Draw the dashed callout box. On by default, because everywhere this form
   * drops into a page it needs to read as something that just appeared. Off
   * when the caller already frames it — a tab panel, say — where a second
   * border inside the first is just noise.
   */
  framed = true,
  /** Picking someone already registered, from the "already registered?" list. Defaults to onCreated. */
  onUseExisting,
}: {
  onCreated: (p: PatientDTO) => void;
  onCancel?: () => void;
  initialMobile?: string;
  framed?: boolean;
  onUseExisting?: (p: PatientDTO) => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [ageUnit, setAgeUnit] = useState<'YEARS' | 'MONTHS' | 'DAYS'>('YEARS');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState('');
  const [mobile, setMobile] = useState(initialMobile);
  const [cnic, setCnic] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A date of birth decides the age; the age boxes then just show it.
  const fromDob = dob && !Number.isNaN(Date.parse(dob)) ? ageFromDob(new Date(dob)) : null;

  // A returning patient registered a second time splits their history in two:
  // earlier results stop showing as "last result", and a family card on the
  // first record is missed. So as the name and number are typed, anyone
  // already on file who matches is offered — without blocking, because
  // families share a phone and names repeat.
  const [similar, setSimilar] = useState<SimilarPatientDTO[]>([]);
  const similarDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(similarDeb.current);
    const n = fullName.trim();
    const m = mobile.trim();
    if (n.length < 3 && !/^0\d{10}$/u.test(m)) { setSimilar([]); return; }
    similarDeb.current = setTimeout(() => {
      findSimilarPatientsAction({ fullName: n, mobile: m }).then(setSimilar).catch(() => setSimilar([]));
    }, 400);
    return () => clearTimeout(similarDeb.current);
  }, [fullName, mobile]);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await createPatientAction({
        fullName,
        age: fromDob ? fromDob.age : age ? Number(age) : undefined,
        ageUnit: fromDob ? fromDob.unit : ageUnit,
        dateOfBirth: dob || undefined,
        sex: sex || undefined,
        mobile: mobile || undefined,
        cnic: cnic || undefined,
        email: email || undefined,
        address: address || undefined,
        photoDataUrl: photo || undefined,
      });
      if (res.ok) onCreated(res.patient);
      else setError(res.error);
    });
  }

  return (
    <div
      className={cn(
        'space-y-3',
        framed && 'mt-3 animate-fade-in-up rounded-xl border border-dashed border-brand-300/60 bg-brand-500/5 p-4',
      )}
    >
      <div className="flex items-start gap-3">
        <PhotoCapture value={photo} onChange={setPhoto} />
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t('reception.fullName')}
          className="field min-w-0 flex-1"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor="pt-dob">{t('reception.dob')}</label>
          <input id="pt-dob" type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="pt-age">{t('reception.age')}</label>
          <div className="flex gap-1.5">
            <input
              id="pt-age"
              type="number"
              min={0}
              value={fromDob ? String(fromDob.age) : age}
              disabled={Boolean(fromDob)}
              onChange={(e) => setAge(e.target.value)}
              placeholder={t('reception.age')}
              className="field min-w-0"
            />
            <Select
              value={fromDob ? fromDob.unit : ageUnit}
              onChange={(v) => setAgeUnit(v as 'YEARS' | 'MONTHS' | 'DAYS')}
              options={[
                { value: 'YEARS', label: t('reception.years') },
                { value: 'MONTHS', label: t('reception.months') },
                { value: 'DAYS', label: t('reception.days') },
              ]}
              className="w-28 shrink-0"
            />
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="label">{t('reception.sex')}</span>
          <Select
            value={sex}
            onChange={setSex}
            placeholder={t('reception.sex')}
            options={[
              { value: 'MALE', label: t('reception.male') },
              { value: 'FEMALE', label: t('reception.female') },
              { value: 'OTHER', label: t('reception.other') },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder={t('reception.mobile')}
          className="field"
          inputMode="tel"
        />
        <input
          value={cnic}
          onChange={(e) => setCnic(formatCnic(e.target.value))}
          placeholder={`${t('reception.cnic')} · ${t('reception.cnicPlaceholder')}`}
          aria-label={t('reception.cnic')}
          className="field font-mono"
          inputMode="numeric"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('reception.email')}
          aria-label={t('reception.email')}
          className="field"
          type="email"
          inputMode="email"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('reception.address')}
          className="field"
        />
      </div>

      {similar.length > 0 && (
        <div className="rounded-xl border border-warn-line bg-warn-soft p-3" role="status">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warn-text">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {t('patient.similarTitle')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {similar.map((m) => (
              <li key={m.patient.id} className="flex items-center gap-3 rounded-lg bg-surface/80 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-strong">{m.patient.fullName}</div>
                  <div className="truncate text-xs text-muted">
                    {[
                      m.patient.mrNo,
                      m.patient.age != null ? `${m.patient.age} ${t('common.years')}` : null,
                      m.patient.sex ? t(`reception.${m.patient.sex.toLowerCase()}`) : null,
                      m.patient.mobile,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-warn-text">
                    {[m.sameMobile && t('patient.sameMobile'), m.sameName && t('patient.sameName')].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => (onUseExisting ?? onCreated)(m.patient)}>
                  {t('patient.useThis')}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('patient.similarHint')}</p>
        </div>
      )}
      {error && <p className="note-danger"><Tr text={error} /></p>}
      <div className="flex gap-2">
        <Button
          onClick={save}
          loading={isPending}
          disabled={fullName.trim().length < 2}
          className="flex-1"
        >
          {similar.length > 0 ? t('patient.saveNew') : t('reception.savePatient')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        )}
      </div>
    </div>
  );
}

/**
 * A small webcam photo. The stream is opened only while taking the picture and
 * stopped straight after, and the image is shrunk to a thumbnail before it is
 * kept — it identifies a face at the chair, it is not a portrait.
 */
function PhotoCapture({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = () => { stream.current?.getTracks().forEach((tr) => tr.stop()); stream.current = null; };
  useEffect(() => stop, []);

  async function start() {
    setFailed(false);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      setOpen(true);
      requestAnimationFrame(() => { if (video.current && stream.current) { video.current.srcObject = stream.current; void video.current.play(); } });
    } catch {
      setFailed(true);
    }
  }

  function capture() {
    const v = video.current;
    if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 180;
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL('image/jpeg', 0.8));
    stop();
    setOpen(false);
  }

  if (open) {
    return (
      <div className="flex shrink-0 flex-col gap-1.5">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview */}
        <video ref={video} className="h-24 w-32 rounded-lg bg-black object-cover" muted playsInline />
        <div className="flex gap-1">
          <Button size="sm" onClick={capture}>{t('reception.capture')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { stop(); setOpen(false); }} aria-label={t('common.cancel')}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL */}
          <img src={value} alt={t('reception.photo')} className="h-12 w-12 rounded-full object-cover ring-2 ring-brand-500/30" />
          <button type="button" onClick={() => onChange(null)} className="text-[10px] font-semibold text-muted hover:text-danger-text">{t('reception.removePhoto')}</button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          title={failed ? t('reception.cameraBlocked') : t('reception.takePhoto')}
          aria-label={t('reception.takePhoto')}
          className={cn('grid h-12 w-12 place-items-center rounded-full border border-dashed transition-colors',
            failed ? 'border-danger-line text-danger-text' : 'border-line-strong text-subtle hover:border-brand-400 hover:text-brand-600')}
        >
          <Camera className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
