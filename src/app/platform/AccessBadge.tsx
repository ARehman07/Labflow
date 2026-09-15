import type { AccessLevel } from '@/core/billing/access';

const STYLE: Record<AccessLevel, [string, string]> = {
  ACTIVE: ['Active', 'bg-ok-soft text-ok-text'],
  GRACE: ['Overdue · grace', 'bg-warn-soft text-warn-text'],
  READ_ONLY: ['Read-only', 'bg-danger-soft text-danger-text'],
  SUSPENDED: ['Suspended', 'bg-surface-3 text-muted'],
};

export function AccessBadge({ level }: { level: AccessLevel }) {
  const [label, cls] = STYLE[level];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
