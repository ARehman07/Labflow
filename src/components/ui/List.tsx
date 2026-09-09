import { cn } from '@/lib/utils';

/**
 * The card language, factored out of the lab workboard so every screen speaks it.
 *
 * The rule it encodes: separation is drawn with space, type and hover — never
 * with rules. The one line we keep is the rail, and it earns its place by
 * carrying meaning (it spans exactly the rows that belong to its group) rather
 * than merely dividing.
 *
 * Printed surfaces are deliberately excluded: a lab report and a cash slip are
 * read on paper, where ruled tables are the convention and hover does not exist.
 */

/** A tint used by a group: the dot on its heading and the rail beside its rows. */
export interface Accent {
  dot: string;
  text: string;
  rail: string;
}

export const ACCENT: Record<string, Accent> = {
  neutral: { dot: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-300', rail: 'bg-slate-200 dark:bg-slate-700' },
  brand: { dot: 'bg-brand-500', text: 'text-brand-600 dark:text-brand-300', rail: 'bg-brand-200 dark:bg-brand-500/30' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', rail: 'bg-amber-200 dark:bg-amber-500/30' },
  violet: { dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', rail: 'bg-violet-200 dark:bg-violet-500/30' },
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', rail: 'bg-emerald-200 dark:bg-emerald-500/30' },
  rose: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-300', rail: 'bg-rose-200 dark:bg-rose-500/30' },
};

/**
 * Small-caps section label. Replaces the grey header bar with a rule under it —
 * it sits directly on the card and lets the gap above do the separating.
 */
export function SectionHeading({
  children, accent, count, meta, action, className,
}: {
  children: React.ReactNode;
  /** Omit for a plain muted label with no colour dot. */
  accent?: Accent;
  count?: number;
  /** Quiet detail that follows the label and its count, in sentence case. */
  meta?: React.ReactNode;
  /** Right-aligned affordance. Keep it a text button — a filled one here
   *  competes with the real actions on the rows below. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-1.5 flex items-center gap-2', className)}>
      {accent && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', accent.dot)} aria-hidden />}
      <h3 className={cn('text-[11px] font-bold uppercase tracking-wider', accent?.text ?? 'text-subtle')}>
        {children}
        {count != null && <span className="ms-1.5 font-semibold tabular-nums opacity-60">{count}</span>}
      </h3>
      {meta && <span className="min-w-0 truncate text-[11px] font-medium text-subtle">{meta}</span>}
      {action && <div className="ms-auto shrink-0">{action}</div>}
    </div>
  );
}

/** A quiet text action for a SectionHeading. */
export function HeadingAction({
  className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        'text-brand-600 transition-colors hover:bg-brand-500/10 dark:text-brand-300',
        className,
      )}
    />
  );
}

/**
 * Rows gathered behind a tinted rail. The rail's length is information: it spans
 * exactly the rows in this group, so how much sits at a stage is legible before
 * a single word is read.
 */
export function RailGroup({
  accent, children, className,
}: { accent: Accent; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      <span className={cn('w-0.5 shrink-0 rounded-full', accent.rail)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** An unruled list. Rows are told apart by rhythm and hover, not by lines. */
export function RowList({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('space-y-0.5', className)} {...props} />;
}

/**
 * One row. Highlights as a soft rounded block rather than a full-bleed band, so
 * a card never reads as a table.
 */
export function Row({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2', className)}
      {...props}
    />
  );
}

/** The clickable variant, for rows that open something. */
export function RowButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}
