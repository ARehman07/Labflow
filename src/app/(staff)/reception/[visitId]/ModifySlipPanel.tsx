'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { PatientFields, patientFieldsValid, type AgeUnit, type PatientFieldValues } from '@/components/patients/PatientFields';
import { updateSlipPatientAction, reopenResultsAction } from '@/modules/reception/slip.actions';
import type { SlipData } from './SlipView';

/**
 * Modify slip. Two corrections the counter needs after a slip is printed:
 * the patient's details were typed wrong, or a released result was wrong and
 * has to come back for correction. Changing the tests is Edit booking.
 *
 * The patient part is the same PatientFields the registration form uses, with
 * the same four required facts, so a correction never asks for more or less
 * than registering did.
 */
export function ModifySlipPanel({ data, onClose }: { data: SlipData; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const p = data.patient;
  const [f, setF] = useState<PatientFieldValues>({
    fullName: p.fullName,
    mobile: p.mobile ?? '',
    sex: p.sex ?? '',
    age: p.age != null ? String(p.age) : '',
    ageUnit: (['YEARS', 'MONTHS', 'DAYS'].includes(p.ageUnit) ? p.ageUnit : 'YEARS') as AgeUnit,
    cnic: p.cnic ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, startSave] = useTransition();
  const [reopening, startReopen] = useTransition();
  const canSave = patientFieldsValid(f);

  function save() {
    if (!canSave) return;
    setError(null);
    startSave(async () => {
      const res = await updateSlipPatientAction(data.visitId, {
        fullName: f.fullName,
        mobile: f.mobile.trim(),
        sex: f.sex,
        age: Number(f.age),
        ageUnit: f.ageUnit,
        cnic: f.cnic,
        email: f.email,
        address: f.address,
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
          <PatientFields value={f} onChange={setF} idPrefix="modify" />
          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <p className="me-auto text-xs text-subtle">{canSave ? ' ' : t('patient.requiredHint')}</p>
            <Button onClick={save} loading={saving} disabled={!canSave}>{t('modify.save')}</Button>
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
