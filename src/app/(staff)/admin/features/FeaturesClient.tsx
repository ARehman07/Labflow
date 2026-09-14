'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SaveBar } from '@/components/ui/SaveBar';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import { FEATURE_GROUPS, SAMPLE_SOURCE_FEATURES, type FeatureKey, type Features } from '@/core/features/catalog';
import { saveLabFeaturesAction } from '@/modules/settings/features.actions';

const GROUP_ACCENT = { BOOKING: ACCENT.brand, LAB: ACCENT.amber, MONEY: ACCENT.emerald, PATIENTS: ACCENT.violet } as const;
const SAMPLE_KEYS = Object.values(SAMPLE_SOURCE_FEATURES) as FeatureKey[];

/**
 * The lab owner's switchboard: which parts of LabFlow this lab uses. What is
 * off disappears from the menu, the screens and the booking steps.
 */
export function FeaturesClient({ initial }: { initial: Features }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const samplesOn = SAMPLE_KEYS.filter((k) => f[k]).length;
  const offCount = Object.values(f).filter((v) => !v).length;

  function save() {
    setError(null);
    startSave(async () => {
      const res = await saveLabFeaturesAction(f);
      if (res.ok) { setF(res.features); setSaved(res.features); toast('success', t('feat.saved')); router.refresh(); }
      else { setError(res.error); toast('error', res.error); }
    });
  }

  return (
    <div className="page">
      <PageHeader title={t('feat.title')} subtitle={t('feat.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />

      <p className="text-sm text-muted">{offCount === 0 ? t('feat.allOn') : t('feat.offCount').replace('{n}', String(offCount))}</p>

      {FEATURE_GROUPS.map((g) => (
        <Card key={g.group} className="p-5">
          <SectionHeading accent={GROUP_ACCENT[g.group]}>{t(`feat.group.${g.group}`)}</SectionHeading>
          <ul className="mt-2 divide-y divide-line">
            {g.keys.map((key) => {
              // The last way of taking a sample cannot be switched off.
              const locked = SAMPLE_KEYS.includes(key) && f[key] && samplesOn === 1;
              return (
                <li key={key} className="flex items-start gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-body">{t(`feat.${key}`)}</p>
                    <p className="mt-0.5 text-xs text-subtle">{locked ? t('feat.lastSample') : t(`feat.${key}.desc`)}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={f[key]}
                    aria-label={t(`feat.${key}`)}
                    disabled={locked}
                    onClick={() => setF({ ...f, [key]: !f[key] })}
                    className={cn(
                      'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      f[key] ? 'bg-brand-500' : 'bg-surface-3 ring-1 ring-inset ring-line',
                    )}
                  >
                    <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', f[key] ? 'start-[22px]' : 'start-0.5')} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {error && <p className="note-danger"><Tr text={error} /></p>}
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setF(saved)} saveLabel={t('feat.save')} note={t('feat.saveNote')} />
    </div>
  );
}
