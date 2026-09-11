'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Shown on hover when disabled. Say why it is unavailable, not just that. */
  title?: string;
}

/**
 * Segmented control — one choice from two or three, all of them visible.
 *
 * Drawn as a recessed track carrying a single raised thumb, so the selection
 * is carried by depth and not only by colour. What it replaced was a row of
 * bordered buttons whose active state was a 10% brand wash: on a white card,
 * at a glance, every segment looked the same, and the whole thing read as a
 * toolbar rather than a choice.
 *
 * The track and thumb are their own tokens because the effect has to invert
 * with the theme. Raised means lighter than its surroundings in dark, and
 * shadowed-but-equal in light; a fixed white-on-grey thumb would look pressed
 * IN on a dark ground, which says the opposite of what is meant.
 *
 * Sizes: `md` for a control that owns a panel, `sm` for one nested inside one.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-full gap-1 rounded-xl bg-segment-track p-1',
        'ring-1 ring-inset ring-line',
        className,
      )}
      style={{ boxShadow: 'var(--inset-well)' }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold',
              'transition-[background-color,color,box-shadow,transform] duration-200',
              size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-2.5 py-2 text-sm',
              o.disabled && 'cursor-not-allowed text-subtle opacity-60',
              !o.disabled &&
                on &&
                'bg-segment-thumb text-brand-700 shadow-card ring-1 ring-line dark:text-brand-300',
              !o.disabled && !on && 'text-muted hover:text-strong active:scale-[0.98]',
            )}
          >
            {o.icon}
            {/* A nested `sm` control sits in a narrow panel and carries the
                longest labels ("Use a family member's card"), so it wraps to a
                second line rather than cutting the label off mid-word. */}
            <span className={size === 'sm' ? 'text-center leading-tight' : 'truncate'}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
