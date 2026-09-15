'use client';

import { Printer } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button, type ButtonProps } from './Button';
import { printElement } from '@/lib/print-isolated';

/** Prints the page's .print-area (slip, receipt, labels) from a hidden copy, so the screen keeps its theme. */
export function PrintButton({ variant = 'secondary', label }: { variant?: ButtonProps['variant']; label?: string }) {
  const { t } = useI18n();
  return (
    <Button variant={variant} onClick={() => void printElement(document.querySelector('.print-area'))} className="print:hidden">
      <Printer className="h-4 w-4" /> {label ?? t('slip.print')}
    </Button>
  );
}
