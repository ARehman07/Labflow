'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Checkbox with a real `<input>` underneath.
 *
 * The native box is hidden rather than replaced: it stays in the tab order,
 * keeps Space working, and still announces itself to a screen reader. What is
 * drawn is a sibling that follows `peer-checked`, so nothing has to be kept in
 * sync by hand.
 *
 * Sized for a counter, not a settings page — the whole row is the target, so
 * it can be hit quickly without aiming at a 16px square.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-all duration-200',
        checked
          ? 'border-brand-500/50 bg-brand-500/8'
          : 'border-line-strong bg-surface-inset hover:border-muted',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all duration-200',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-1',
          checked
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-line-strong bg-surface',
        )}
      >
        <Check className={cn('h-3.5 w-3.5 transition-transform duration-200', checked ? 'scale-100' : 'scale-0')} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-body">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
