'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

export interface ComboItem {
  id: string;
  label: string;
  sublabel?: string;
  right?: string;
}

interface ComboboxProps {
  query: string;
  onQueryChange: (q: string) => void;
  items: ComboItem[];
  onSelect: (item: ComboItem) => void;
  placeholder?: string;
  loading?: boolean;
  emptyText?: string;
  minChars?: number;
  leftIcon?: React.ReactNode;
}

/**
 * Async search combobox. Results render in a properly-stacked (z-50) menu BELOW
 * the input; selection uses onMouseDown so the click registers before the input
 * blurs. Closes on outside-click / Escape. Replaces the buggy ad-hoc dropdowns.
 */
export function Combobox({
  query,
  onQueryChange,
  items,
  onSelect,
  placeholder,
  loading,
  emptyText,
  minChars = 1,
  leftIcon,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setActive(0), [items]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const canShow = query.trim().length >= minChars;
  const showMenu = open && canShow;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-subtle">
            {leftIcon}
          </span>
        )}
        <input
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={cn('field', leftIcon ? 'ps-10' : '')}
          onKeyDown={(e) => {
            if (!showMenu) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it) { onSelect(it); setOpen(false); } }
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {loading && (
          <span className="absolute inset-y-0 end-0 flex items-center pe-3 text-brand-500">
            <Spinner className="h-4 w-4" />
          </span>
        )}
      </div>

      {showMenu && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-dropdown animate-scale-in">
          {items.length === 0 ? (
            <div className="px-4 py-3 text-sm text-subtle">{loading ? '…' : (emptyText ?? 'No matches')}</div>
          ) : (
            <ul className="max-h-64 overflow-auto p-1">
              {items.map((it, i) => (
                <li key={it.id}>
                  <button
                    type="button"
                    // onMouseDown fires before input blur, so the selection always registers
                    onMouseDown={(e) => { e.preventDefault(); onSelect(it); setOpen(false); }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start transition-colors',
                      i === active ? 'bg-brand-500/10' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-body">{it.label}</span>
                      {it.sublabel && <span className="block truncate text-xs text-muted">{it.sublabel}</span>}
                    </span>
                    {it.right && <span className="shrink-0 text-sm font-semibold text-brand-700">{it.right}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
