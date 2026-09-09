'use client';

import Link from 'next/link';

import { LogOut } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';
import { Icon } from '@/components/ui/Icon';
import { logoutAction } from '@/app/(staff)/actions';

interface TopbarProps {
  userName: string;
  role: string;
  branchName: string | null;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Clinical software reads as calm and legible, not as a dark dashboard. The
 * bar is the same surface as the content it sits above, separated by a
 * hairline and a single teal keyline for identity.
 *
 * Spacing is deliberate: controls are grouped and the groups are separated by
 * dividers, so display preferences, identity and sign-out read as three
 * distinct things rather than a row of similar buttons.
 */
export function Topbar({ userName, role, branchName }: TopbarProps) {
  const { t } = useI18n();

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      {/* A thin diagnostic keyline — brand identity without a heavy bar. */}
      <div className="h-0.5 w-full bg-gradient-to-r from-brand-500 via-clinic-500 to-brand-500" />

      <div className="flex h-16 items-center justify-between gap-6 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Icon name="flask" className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-bold tracking-tight text-strong">
              {t('app.name')}
            </div>
            {branchName && (
              <div className="truncate text-[11px] font-medium text-muted">{branchName}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Display preferences */}
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle tone="light" compact />
          </div>

          <div className="mx-1 hidden h-8 w-px bg-line sm:block" />

          {/* Who is signed in — and the way to your own account */}
          <Link
            href="/account"
            title="Your account"
            className="hidden items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2 sm:flex"
          >
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-600 ring-1 ring-brand-500/25 dark:text-brand-300">
              {initials(userName)}
            </div>
            <div className="text-start leading-tight">
              <div className="text-[13px] font-semibold text-strong">{userName}</div>
              <div className="text-[11px] text-muted">{role}</div>
            </div>
          </Link>

          <div className="mx-1 hidden h-8 w-px bg-line sm:block" />

          <form action={logoutAction}>
            <button
              type="submit"
              className="flex h-9 items-center gap-2 rounded-lg border border-line px-3.5 text-[13px] font-semibold text-muted transition-colors hover:border-danger-line hover:bg-danger-soft hover:text-danger-text"
            >
              <LogOut className="h-4 w-4" />
              {t('action.logout')}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
