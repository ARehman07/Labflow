import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

const button = cva(
  // whitespace-nowrap + shrink-0: a button label must never wrap or be
  // squeezed by a greedy sibling (an input in a flex row will do exactly that).
  'btn inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 ease-out active:scale-[0.97] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm hover:to-brand-700 hover:shadow-md',
        secondary: 'bg-surface-3 text-body hover:bg-line active:bg-line-strong',
        ghost: 'bg-transparent text-muted hover:bg-surface-3 hover:text-strong',
        outline: 'border border-line-strong bg-surface text-body hover:border-brand-400 hover:text-brand-600 hover:bg-brand-500/10 dark:hover:text-brand-300',
        danger: 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-sm hover:to-red-700',
        success: 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm hover:to-emerald-700',
      },
      size: {
        sm: 'gap-1.5 rounded-lg px-3 py-1.5 text-xs',
        md: 'gap-2 rounded-xl px-4 py-2.5 text-sm',
        lg: 'gap-2 rounded-xl px-5 py-3 text-base',
        icon: 'rounded-xl p-2.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(button({ variant, size }), className)}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
