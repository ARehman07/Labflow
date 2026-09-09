'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from './Button';

export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      🖨 {t('slip.print')}
    </Button>
  );
}
