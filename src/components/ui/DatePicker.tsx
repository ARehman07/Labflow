'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Select } from './Select';
import { Segmented } from './Segmented';

/**
 * A date (and optionally time) field with a calendar in the app's own style,
 * in place of the browser's picker, which looks different on every machine.
 *
 * The value is the same string a native input gives — `YYYY-MM-DD`, or
 * `YYYY-MM-DDTHH:mm` with `withTime` — so swapping one in changes no data.
 * The calendar opens under the field (above it when there is no room), is
 * `position: fixed` so no card clips it, and closes on a pick, Escape or a
 * click outside. Arrow keys move a day or a week, Page Up/Down a month.
 */

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  /** Earliest and latest pickable day, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  placeholder?: string;
  /** Show a clear button; off for fields that always hold a date. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Replaces the field look, e.g. a bold chip. */
  triggerClassName?: string;
  /** How the chosen day is written on the field. */
  format?: Intl.DateTimeFormatOptions;
  title?: string;
  'aria-label'?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};
const parseTime = (s: string): { h: number; m: number } | null => {
  const m = /T(\d{2}):(\d{2})/u.exec(s);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
};

const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
/** A time to start from when a day is picked with none set yet: the end of the working day. */
const DEFAULT_TIME = { h: 17, m: 0 };

export function DatePicker({
  id, value, onChange, withTime = false, min, max, placeholder, clearable = true, disabled,
  className, triggerClassName, format, title, 'aria-label': ariaLabel,
}: DatePickerProps) {
  const { t, locale } = useI18n();
  const intl = locale === 'ur' ? 'ur-PK' : 'en-GB';
  const selected = parseDay(value);
  const time = parseTime(value);
  const today = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }, []);

  const [open, setOpen] = useState(false);
  // The day the keyboard is on, and so the month on show.
  const [cursor, setCursor] = useState<Date>(selected ?? today);
  const [rect, setRect] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const minD = min ? parseDay(min) : null;
  const maxD = max ? parseDay(max) : null;
  const outOfRange = (d: Date) => (minD != null && d < minD) || (maxD != null && d > maxD);

  const WIDTH = 320;
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const height = withTime ? 430 : 372;
    const below = window.innerHeight - r.bottom > height || window.innerHeight - r.bottom > r.top;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
    setRect({ top: below ? r.bottom + 6 : r.top - 6, left, below });
  }, [withTime]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  // Open on the chosen day (or today), with the keyboard on it.
  useEffect(() => {
    if (!open) return;
    setCursor(selected ?? (maxD && today > maxD ? maxD : today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // The path is read as it was when the click began: picking an hour removes
    // that menu before this runs, and a detached target would look "outside".
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !e.composedPath().includes(ref.current)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      const r = btnRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
      place();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, place]);

  // Keep the focused day focused as the keyboard moves it.
  useEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${isoDay(cursor)}"]`)?.focus({ preventScroll: true });
  }, [open, cursor]);

  const compose = (d: Date, tm: { h: number; m: number } | null) =>
    withTime ? `${isoDay(d)}T${pad((tm ?? DEFAULT_TIME).h)}:${pad((tm ?? DEFAULT_TIME).m)}` : isoDay(d);

  function pick(d: Date) {
    if (outOfRange(d)) return;
    onChange(compose(d, time));
    if (!withTime) { setOpen(false); btnRef.current?.focus(); }
  }

  function setTime(next: { h: number; m: number }) {
    onChange(compose(selected ?? today, next));
  }

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(cursor, -1), ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7), ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1), PageDown: () => addMonths(cursor, 1),
      Home: () => addDays(cursor, -((cursor.getDay() + 6) % 7)), End: () => addDays(cursor, 6 - ((cursor.getDay() + 6) % 7)),
    };
    const key = document.dir === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ? (e.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft')
      : e.key;
    if (moves[key]) { e.preventDefault(); setCursor(moves[key]()); }
  }

  // Six weeks from the Monday on or before the 1st, so the grid never changes height.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intl, { weekday: 'narrow' }).format(addDays(new Date(2024, 0, 1), i)));
  const monthLabel = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' }).format(first);
  const canPrev = !minD || new Date(first.getFullYear(), first.getMonth(), 0) >= minD;
  const canNext = !maxD || new Date(first.getFullYear(), first.getMonth() + 1, 1) <= maxD;

  const shown = selected
    ? new Intl.DateTimeFormat(intl, format ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(selected)
      + (withTime && time ? ` · ${new Intl.DateTimeFormat(intl, { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(2000, 0, 1, time.h, time.m))}` : '')
    : null;

  const h12 = time ? ((time.h + 11) % 12) + 1 : null;
  const pm = time ? time.h >= 12 : DEFAULT_TIME.h >= 12;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        className={cn(
          triggerClassName ?? 'field flex items-center gap-2.5 text-start',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <span className={cn('min-w-0 flex-1 truncate', !shown && 'text-subtle')}>{shown ?? placeholder ?? t('date.pick')}</span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={t('date.clear')}
            title={t('date.clear')}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="-me-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-strong"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && rect && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={placeholder ?? t('date.pick')}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } }}
          style={{
            position: 'fixed',
            top: rect.below ? rect.top : undefined,
            bottom: rect.below ? undefined : window.innerHeight - rect.top,
            left: rect.left,
            width: WIDTH,
            zIndex: 60,
          }}
          className="origin-top animate-scale-in rounded-2xl border border-line bg-surface p-3 shadow-dropdown"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setCursor(addMonths(cursor, -1))}
              aria-label={t('date.prevMonth')}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-strong disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
            <span className="text-sm font-bold text-strong" aria-live="polite">{monthLabel}</span>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label={t('date.nextMonth')}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-strong disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-subtle">
            {weekdays.map((w, i) => <span key={i} className="py-1">{w}</span>)}
          </div>
          <div ref={gridRef} role="grid" onKeyDown={onGridKey} className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const iso = isoDay(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isSel = selected != null && iso === isoDay(selected);
              const isToday = iso === isoDay(today);
              const off = outOfRange(d);
              return (
                <button
                  key={iso}
                  type="button"
                  data-day={iso}
                  tabIndex={iso === isoDay(cursor) ? 0 : -1}
                  disabled={off}
                  aria-pressed={isSel}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => { setCursor(d); pick(d); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(d); } }}
                  className={cn(
                    'grid h-9 place-items-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    isSel
                      ? 'bg-brand-600 font-bold text-white'
                      : isToday
                        ? 'font-bold text-brand-700 ring-1 ring-inset ring-brand-500/50 hover:bg-brand-500/10 dark:text-brand-300'
                        : inMonth
                          ? 'text-body hover:bg-surface-2'
                          : 'text-subtle/60 hover:bg-surface-2',
                    off && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {withTime && (
            <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3">
              <Clock className="me-auto h-4 w-4 shrink-0 text-subtle" aria-label={t('date.time')} />
              <Select
                className="w-20"
                value={h12 ? String(h12) : ''}
                placeholder="--"
                onChange={(v) => {
                  const h = Number(v) % 12 + (pm ? 12 : 0);
                  setTime({ h, m: time?.m ?? 0 });
                }}
                options={HOURS.map((h) => ({ value: String(h), label: String(h) }))}
              />
              <span className="text-subtle">:</span>
              <Select
                className="w-20"
                value={time ? pad(time.m - (time.m % 5)) : ''}
                placeholder="--"
                onChange={(v) => setTime({ h: time?.h ?? DEFAULT_TIME.h, m: Number(v) })}
                options={MINUTES.map((m) => ({ value: pad(m), label: pad(m) }))}
              />
              <div className="w-[5.5rem]">
                <Segmented
                  size="sm"
                  value={pm ? 'PM' : 'AM'}
                  onChange={(v) => {
                    const base = time ?? DEFAULT_TIME;
                    const h = (base.h % 12) + (v === 'PM' ? 12 : 0);
                    setTime({ h, m: base.m });
                  }}
                  ariaLabel={t('date.time')}
                  options={[{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]}
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <button
              type="button"
              disabled={outOfRange(today)}
              onClick={() => { setCursor(today); pick(today); }}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-600 hover:bg-brand-500/10 disabled:opacity-40 dark:text-brand-300"
            >
              {t('date.today')}
            </button>
            <div className="flex items-center gap-1">
              {clearable && selected && (
                <button
                  type="button"
                  onClick={() => { onChange(''); setOpen(false); btnRef.current?.focus(); }}
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-strong"
                >
                  {t('date.clear')}
                </button>
              )}
              {withTime && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); btnRef.current?.focus(); }}
                  className="rounded-lg bg-brand-600 px-3 py-1 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  {t('date.done')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
