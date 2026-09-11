'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './Button';

/**
 * A button for an action that is hard to take back.
 *
 * The first press asks, in place, and the second does it. Inline rather than a
 * browser dialog so it stays in the page's language and style, and it quietly
 * stands down after a few seconds if left alone, so a stray first click cannot
 * be "armed" indefinitely.
 */
export function ConfirmButton({
  children, onConfirm, prompt, confirmLabel, loading, disabled, variant = 'ghost', size = 'sm', className,
  tone = 'danger',
}: {
  children: ReactNode;
  onConfirm: () => void;
  /** The question, e.g. "Delete this role?" */
  prompt?: ReactNode;
  confirmLabel?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  /** Danger for destroying something; primary for a bulk action that is merely weighty. */
  tone?: 'danger' | 'primary';
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const id = setTimeout(() => setAsking(false), 8000);
    return () => clearTimeout(id);
  }, [asking]);

  if (!asking) {
    return (
      <Button variant={variant} size={size} className={className} loading={loading} disabled={disabled}
        onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  }

  return (
    <span role="group" className={cn('inline-flex animate-scale-in flex-wrap items-center gap-1.5 rounded-xl py-1 pe-1 ps-3 ring-1',
      tone === 'danger' ? 'bg-danger-soft ring-danger-line' : 'bg-brand-500/8 ring-brand-500/25')}>
      <span className={cn('text-xs font-semibold', tone === 'danger' ? 'text-danger-text' : 'text-brand-700 dark:text-brand-300')}>
        {prompt ?? t('confirm.sure')}
      </span>
      <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" loading={loading} onClick={() => { setAsking(false); onConfirm(); }}>
        {confirmLabel ?? t('confirm.yes')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
    </span>
  );
}
