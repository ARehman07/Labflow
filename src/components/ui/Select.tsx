'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Accessible custom select. The menu is rendered with `position: fixed`, anchored
 * to the trigger's rect — so it escapes any `overflow-hidden` ancestor (tables,
 * cards) and never clips. Closes on outside-click / Escape / scroll.
 */
export function Select({ value, options, onChange, placeholder, disabled, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const below = spaceBelow > 260 || spaceBelow > r.top;
    setRect({ top: below ? r.bottom + 6 : r.top - 6, left: r.left, width: r.width, below });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) { onChange(o.value); setOpen(false); } }
    };
    /**
     * The menu is position:fixed, so page scrolling would leave it stranded
     * away from its trigger — hence repositioning here.
     *
     * The listener is on the capture phase to catch scrolling in any ancestor,
     * which also caught the wheel INSIDE the menu itself: opening a select and
     * scrolling the options closed it immediately. Scrolls originating in the
     * menu are therefore ignored, and the menu only closes once its trigger has
     * actually left the viewport.
     */
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      const r = btnRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
      place();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, active, options, onChange, place]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn('field flex items-center justify-between gap-2 text-start', disabled && 'cursor-not-allowed bg-surface-2 text-muted')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate', !selected && 'text-subtle')}>{selected?.label ?? placeholder ?? '—'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-subtle transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && rect && (
        <ul
          ref={menuRef}
          role="listbox"
          style={{
            position: 'fixed',
            top: rect.below ? rect.top : undefined,
            bottom: rect.below ? undefined : window.innerHeight - rect.top,
            left: rect.left,
            width: rect.width,
            zIndex: 60,
          }}
          className="max-h-60 origin-top overflow-auto rounded-xl border border-line bg-surface p-1 shadow-dropdown animate-scale-in"
        >
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm transition-colors',
                  i === active
                    ? 'bg-brand-500/12 text-brand-700 dark:text-brand-300'
                    : 'text-body hover:bg-surface-2',
                )}
              >
                {o.label}
                {o.value === value && <Check className="h-4 w-4 text-brand-600 dark:text-brand-300" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
