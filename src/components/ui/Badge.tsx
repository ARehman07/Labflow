import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badge = cva(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full font-semibold leading-none ring-1 ring-inset',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-3 text-body ring-line',
        info: 'bg-info-soft text-info-text ring-blue-200 dark:ring-blue-400/30',
        progress: 'bg-warn-soft text-warn-text ring-amber-200 dark:ring-amber-400/30',
        purple: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/12 dark:text-violet-300 dark:ring-violet-400/30',
        success: 'bg-ok-soft text-ok-text ring-emerald-200 dark:ring-emerald-400/30',
        teal: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/12 dark:text-teal-300 dark:ring-teal-400/30',
        danger: 'bg-danger-soft text-danger-text ring-red-200 dark:ring-red-400/30',
        warning: 'bg-warn-soft text-warn-text ring-amber-200 dark:ring-amber-400/30',
      },
      size: {
        sm: 'px-2 py-0.5 text-[11px]',
        md: 'px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  dot?: boolean;
}

export function Badge({ className, tone, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone, size }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
