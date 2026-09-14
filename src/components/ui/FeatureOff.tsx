'use client';

import Link from 'next/link';
import { ToggleLeft } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';

/** What a switched-off part of LabFlow shows instead of itself. */
export function FeatureOff() {
  const { t } = useI18n();
  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle"><ToggleLeft className="h-6 w-6" /></span>
      <h1 className="text-lg font-bold text-strong">{t('featureOff.title')}</h1>
      <p className="text-sm text-muted">{t('featureOff.body')}</p>
      <Link href="/dashboard" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{t('featureOff.back')}</Link>
    </Card>
  );
}
