'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  createPatientAction,
  findSimilarPatientsAction,
  type PatientDTO,
  type SimilarPatientDTO,
} from '@/modules/reception/reception.actions';
import { Tr } from '@/components/ui/Tr';
import { PatientFields, emptyPatientFields, patientFieldsValid, type PatientFieldValues } from './PatientFields';

/**
 * Register a patient inline.
 *
 * Shared, because registering someone is not only a step in booking tests: a
 * walk-in may come in solely to buy a family card, and refusing to register
 * them until they order a test would be an artificial dead end. The fields
 * themselves are PatientFields, the same ones Modify slip uses.
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
  /** The mobile as it is typed, so the caller can react before the patient is saved (a family card on it, say). */
  onMobileChange,
}: {
  onCreated: (p: PatientDTO) => void;
  onCancel?: () => void;
  initialMobile?: string;
  framed?: boolean;
  onUseExisting?: (p: PatientDTO) => void;
  onMobileChange?: (mobile: string) => void;
}) {
  const { t } = useI18n();
  const [f, setF] = useState<PatientFieldValues>(() => emptyPatientFields(initialMobile));
  useEffect(() => { onMobileChange?.(f.mobile); }, [f.mobile, onMobileChange]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSave = patientFieldsValid(f);

  // A returning patient registered a second time splits their history in two:
  // earlier results stop showing as "last result", and a family card on the
  // first record is missed. So as the name and number are typed, anyone
  // already on file who matches is offered — without blocking, because
  // families share a phone and names repeat.
  const [similar, setSimilar] = useState<SimilarPatientDTO[]>([]);
  const similarDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(similarDeb.current);
    const n = f.fullName.trim();
    const m = f.mobile.trim();
    if (n.length < 3 && !/^0\d{10}$/u.test(m)) { setSimilar([]); return; }
    similarDeb.current = setTimeout(() => {
      findSimilarPatientsAction({ fullName: n, mobile: m }).then(setSimilar).catch(() => setSimilar([]));
    }, 400);
    return () => clearTimeout(similarDeb.current);
  }, [f.fullName, f.mobile]);

  function save() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      const res = await createPatientAction({
        fullName: f.fullName,
        sex: f.sex,
        mobile: f.mobile.trim(),
        age: Number(f.age),
        ageUnit: f.ageUnit,
        cnic: f.cnic || undefined,
        email: f.email || undefined,
        address: f.address || undefined,
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
      <PatientFields value={f} onChange={setF} autoFocus />

      {/* Below the fields and the Save button's row, so it never pushes what is being typed. */}
      {error && <p className="note-danger"><Tr text={error} /></p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} loading={isPending} disabled={!canSave} className="flex-1">
          {similar.length > 0 ? t('patient.saveNew') : t('reception.savePatient')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        )}
        <p className="basis-full text-xs text-subtle">{canSave ? ' ' : t('patient.requiredHint')}</p>
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
    </div>
  );
}
