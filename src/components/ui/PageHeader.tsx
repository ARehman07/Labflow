'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';

/**
 * The top of every staff page: where you are, how to go back, what you can do.
 *
 * One component so every screen answers those three questions in the same
 * place. Back links used to take four different shapes — a ghost button at the
 * far end, a link inside the card, an arrow beside the title, and on one page
 * the dashboard's grid icon — so people had to look for the way out each time.
 */
export function PageHeader({
  title, subtitle, back, actions, icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Where the arrow goes. Omit on top-level pages reached from the menu. */
  back?: { href: string; label?: string };
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-1.5">
        {back && (
          <Link
            href={back.href}
            aria-label={back.label ?? t('common.back')}
            title={back.label ?? t('common.back')}
            className="-ms-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-strong"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-strong">
            {icon}
            <span className="min-w-0">{title}</span>
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
