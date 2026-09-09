'use client';

import { useState, useTransition } from 'react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { createPatientAction, type PatientDTO } from '@/modules/reception/reception.actions';

/**
 * Register a patient inline.
 *
 * Shared, because registering someone is not only a step in booking tests: a
 * walk-in may come in solely to buy a family card, and refusing to register
 * them until they order a test would be an artificial dead end.
 */
export function AddPatientForm({
  onCreated,
  onCancel,
  /** Prefill when the caller already knows the number, e.g. a failed lookup. */
  initialMobile = '',
}: {
  onCreated: (p: PatientDTO) => void;
  onCancel?: () => void;
  initialMobile?: string;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [mobile, setMobile] = useState(initialMobile);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await createPatientAction({
        fullName,
        age: age ? Number(age) : undefined,
        sex: sex || undefined,
        mobile: mobile || undefined,
        address: address || undefined,
      });
      if (res.ok) onCreated(res.patient);
      else setError(res.error);
    });
  }

  return (
    <div className="mt-3 animate-fade-in-up space-y-3 rounded-xl border border-dashed border-brand-300/60 bg-brand-500/5 p-4">
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder={t('reception.fullName')}
        className="field"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder={t('reception.age')}
          className="field"
        />
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
      <input
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
        placeholder={t('reception.mobile')}
        className="field"
        inputMode="tel"
      />
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder={t('reception.address')}
        className="field"
      />
      {error && <p className="note-danger">{error}</p>}
      <div className="flex gap-2">
        <Button
          onClick={save}
          loading={isPending}
          disabled={fullName.trim().length < 2}
          className="flex-1"
        >
          {t('reception.savePatient')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        )}
      </div>
    </div>
  );
}
