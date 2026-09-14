'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { Select } from '@/components/ui/Select';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { updateSlipPatientAction, reopenResultsAction } from '@/modules/reception/slip.actions';
import type { SlipData } from './SlipView';

/**
 * Modify slip. Two corrections the counter needs after a slip is printed:
 * the patient's details were typed wrong, or a released result was wrong and
 * has to come back for correction. Changing the tests is Edit booking.
 */
export function ModifySlipPanel({ data, onClose }: { data: SlipData; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const p = data.patient;
  const [f, setF] = useState({
    fullName: p.fullName,
    mobile: p.mobile ?? '',
    cnic: p.cnic ?? '',
    sex: p.sex ?? '',
    dateOfBirth: p.dateOfBirth ?? '',
    age: p.age != null ? String(p.age) : '',
    ageUnit: p.ageUnit || 'YEARS',
    address: p.address ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, startSave] = useTransition();
  const [reopening, startReopen] = useTransition();
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  function save() {
    setError(null);
    startSave(async () => {
      const res = await updateSlipPatientAction(data.visitId, {
        ...f,
        sex: f.sex || undefined,
        age: f.age === '' ? undefined : Number(f.age),
      });
      if (res.ok) { toast('success', t('modify.saved')); router.refresh(); onClose(); }
      else setError(res.error);
    });
  }

  function reopen() {
    setError(null);
    startReopen(async () => {
      const res = await reopenResultsAction(data.visitId, reason);
      if (res.ok) {
        toast('success', t('modify.pendingDone').replace('{n}', String(res.count ?? 0)));
        setReason('');
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <Card className="no-print space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-strong">{t('modify.title')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('modify.subtitle')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-strong">
          <X className="h-4 w-4" />
        </button>
      </div>

      {data.can.modify && (
        <section>
          <SectionHeading accent={ACCENT.brand}>{t('modify.patient')}</SectionHeading>
          <p className="mb-3 text-xs text-subtle">{t('modify.patientHint').replace('{mr}', data.mrNo)}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="label">{t('reception.fullName')}</span>
              <input value={f.fullName} onChange={(e) => set('fullName')(e.target.value)} maxLength={120} className="field" />
            </label>
            <label className="block">
              <span className="label">{t('reception.mobile')}</span>
              <input value={f.mobile} onChange={(e) => set('mobile')(e.target.value)} inputMode="tel" maxLength={11} placeholder="03001234567" className="field" />
            </label>
            <label className="block">
              <span className="label">{t('modify.cnic')}</span>
              <input value={f.cnic} onChange={(e) => set('cnic')(e.target.value)} inputMode="numeric" maxLength={15} placeholder="3310012345671" className="field" />
            </label>
            <div>
              <span className="label">{t('reception.sex')}</span>
              <Select
                value={f.sex}
                onChange={set('sex')}
                options={[
                  { value: '', label: '—' },
                  { value: 'MALE', label: t('reception.male') },
                  { value: 'FEMALE', label: t('reception.female') },
                  { value: 'OTHER', label: t('reception.other') },
                ]}
              />
            </div>
            <label className="block">
              <span className="label">{t('modify.dob')}</span>
              <input type="date" value={f.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dateOfBirth')(e.target.value)} className="field" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">{t('reception.age')}</span>
                <input type="number" min={0} max={150} value={f.age} disabled={f.dateOfBirth !== ''} onChange={(e) => set('age')(e.target.value)} className="field tabular-nums" />
              </label>
              <div>
                <span className="label">{t('modify.ageUnit')}</span>
                <Select
                  value={f.ageUnit}
                  onChange={set('ageUnit')}
                  options={[
                    { value: 'YEARS', label: t('modify.years') },
                    { value: 'MONTHS', label: t('modify.months') },
                    { value: 'DAYS', label: t('modify.days') },
                  ]}
                />
              </div>
            </div>
            <label className="block">
              <span className="label">{t('reception.address')}</span>
              <input value={f.address} onChange={(e) => set('address')(e.target.value)} maxLength={200} className="field" />
            </label>
          </div>
          {f.dateOfBirth !== '' && <p className="mt-2 text-xs text-subtle">{t('modify.dobHint')}</p>}
          <div className="mt-3 flex justify-end">
            <Button onClick={save} loading={saving} disabled={f.fullName.trim().length < 2}>{t('modify.save')}</Button>
          </div>
        </section>
      )}

      {data.can.reopen && data.releasedCount > 0 && (
        <section className="rounded-xl bg-surface-2 p-4">
          <SectionHeading accent={ACCENT.rose}>{t('modify.pending')}</SectionHeading>
          <p className="mb-3 text-xs text-muted">{t('modify.pendingHint').replace('{n}', String(data.releasedCount))}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder={t('modify.pendingReason')}
              aria-label={t('modify.pendingReason')}
              className="field min-w-48 flex-1"
            />
            <ConfirmButton
              variant="outline"
              size="md"
              onConfirm={reopen}
              loading={reopening}
              disabled={reason.trim().length < 3}
              prompt={t('modify.pendingPrompt')}
              confirmLabel={t('modify.pendingConfirm')}
            >
              <RotateCcw className="h-4 w-4" /> {t('modify.pendingConfirm')}
            </ConfirmButton>
          </div>
        </section>
      )}

      {error && <p className="note-danger"><Tr text={error} /></p>}
    </Card>
  );
}
