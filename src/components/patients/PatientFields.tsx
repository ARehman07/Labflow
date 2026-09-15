'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/utils';

export type AgeUnit = 'YEARS' | 'MONTHS' | 'DAYS';

export interface PatientFieldValues {
  fullName: string;
  mobile: string;
  sex: string;
  age: string;
  ageUnit: AgeUnit;
  cnic: string;
  email: string;
  address: string;
}

export const emptyPatientFields = (mobile = ''): PatientFieldValues => ({
  fullName: '', mobile, sex: '', age: '', ageUnit: 'YEARS', cnic: '', email: '', address: '',
});

const MOBILE = /^0\d{10}$/u;

/** The four facts every patient record needs: name, mobile, gender and age. */
export function patientFieldsValid(v: PatientFieldValues): boolean {
  return v.fullName.trim().length >= 2 && MOBILE.test(v.mobile.trim()) && v.sex !== '' && v.age.trim() !== '';
}

/** Show a CNIC the way it is printed on the card: 35202-1234567-1. */
function formatCnic(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/**
 * The patient details, laid out the same wherever a record is made or
 * corrected — registering at the counter, and Modify slip — so staff meet one
 * form, not two that drift apart.
 *
 * Name, mobile, gender and age come first and are required: the report's
 * reference ranges need age and sex, and the mobile is how the report and a
 * family card find the patient. CNIC, email (for emailed reports) and address
 * are optional and folded away.
 */
export function PatientFields({
  value, onChange, idPrefix = 'pt', autoFocus = false,
}: {
  value: PatientFieldValues;
  onChange: (v: PatientFieldValues) => void;
  /** Keeps field ids unique if two forms are ever on one page. */
  idPrefix?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  // Open from the start when a record already carries optional details, so a
  // correction does not hide what is already on file.
  const [moreOpen, setMoreOpen] = useState(() => !!(value.cnic || value.email || value.address));
  const set = <K extends keyof PatientFieldValues>(k: K) => (v: PatientFieldValues[K]) => onChange({ ...value, [k]: v });

  const mobileWrong = value.mobile.trim().length >= 11 && !MOBILE.test(value.mobile.trim());
  const required = <span className="text-danger-text" aria-hidden> *</span>;
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={id('name')}>{t('reception.fullName')}{required}</label>
          <input
            id={id('name')}
            value={value.fullName}
            onChange={(e) => set('fullName')(e.target.value)}
            placeholder={t('reception.fullName')}
            maxLength={120}
            className="field"
            autoComplete="off"
            aria-required
            autoFocus={autoFocus}
          />
        </div>

        <div>
          <label className="label" htmlFor={id('mobile')}>{t('reception.mobile')}{required}</label>
          <input
            id={id('mobile')}
            value={value.mobile}
            onChange={(e) => set('mobile')(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="03001234567"
            className={cn('field font-mono tabular-nums', mobileWrong && 'border-danger-line')}
            inputMode="tel"
            autoComplete="off"
            aria-required
            aria-invalid={mobileWrong || undefined}
            aria-describedby={id('mobile-hint')}
          />
          {/* Always rendered, so the hint appearing never moves the fields below. */}
          <p id={id('mobile-hint')} className={cn('mt-1 min-h-4 text-xs leading-4', mobileWrong ? 'text-danger-text' : 'text-subtle')}>
            {mobileWrong ? t('patient.mobileHint') : t('patient.mobileFormat')}
          </p>
        </div>

        <div>
          <span className="label">{t('reception.sex')}{required}</span>
          <Select
            value={value.sex}
            onChange={set('sex')}
            placeholder={t('patient.chooseSex')}
            options={[
              { value: 'MALE', label: t('reception.male') },
              { value: 'FEMALE', label: t('reception.female') },
              { value: 'OTHER', label: t('reception.other') },
            ]}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor={id('age')}>{t('reception.age')}{required}</label>
          <div className="flex gap-1.5">
            <input
              id={id('age')}
              type="number"
              min={0}
              max={150}
              value={value.age}
              onChange={(e) => set('age')(e.target.value)}
              placeholder={t('reception.age')}
              className="field min-w-0 flex-1 tabular-nums"
              aria-required
            />
            <Select
              value={value.ageUnit}
              onChange={(v) => set('ageUnit')(v as AgeUnit)}
              options={[
                { value: 'YEARS', label: t('reception.years') },
                { value: 'MONTHS', label: t('reception.months') },
                { value: 'DAYS', label: t('reception.days') },
              ]}
              className="w-32 shrink-0"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-start text-sm font-semibold text-body transition-colors hover:bg-surface-2"
        >
          <span>
            {t('patient.moreDetails')}
            <span className="ms-1.5 font-normal text-subtle">{t('patient.moreDetailsHint')}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-subtle transition-transform', moreOpen && 'rotate-180')} />
        </button>
        {moreOpen && (
          <div className="grid gap-3 border-t border-line p-3.5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={id('cnic')}>{t('reception.cnic')}</label>
              <input
                id={id('cnic')}
                value={value.cnic}
                onChange={(e) => set('cnic')(formatCnic(e.target.value))}
                placeholder={t('reception.cnicPlaceholder')}
                className="field font-mono"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="label" htmlFor={id('email')}>{t('reception.email')}</label>
              <input
                id={id('email')}
                value={value.email}
                onChange={(e) => set('email')(e.target.value)}
                placeholder="name@example.com"
                maxLength={120}
                className="field"
                type="email"
                inputMode="email"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={id('address')}>{t('reception.address')}</label>
              <input
                id={id('address')}
                value={value.address}
                onChange={(e) => set('address')(e.target.value)}
                placeholder={t('reception.address')}
                maxLength={200}
                className="field"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
