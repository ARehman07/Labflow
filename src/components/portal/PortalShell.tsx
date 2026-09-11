'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { logoutAction } from '@/app/(staff)/actions';
import { cn } from '@/lib/utils';

/**
 * The frame for people outside the lab — a partner lab or a referring doctor.
 * Deliberately small: their own work and nothing of the lab's, so the menu is
 * a few tabs, not the staff sidebar.
 */
export function PortalShell({
  labName, who, links, children,
}: {
  labName: string;
  who: string;
  links: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Icon name="flask" className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-bold text-strong">{labName}</div>
              <div className="truncate text-xs text-muted">{who}</div>
            </div>
          </div>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1">
            {links.map((l) => {
              const active = l.href === pathname || (l.href !== links[0].href && pathname.startsWith(l.href));
              return (
                <Link key={l.href} href={l.href} className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                  active ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-strong')}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle tone="light" compact />
            <form action={logoutAction}>
              <button type="submit" className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-danger-soft hover:text-danger-text">
                <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">{t('action.logout')}</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
