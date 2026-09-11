'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { getNavCountsAction, type NavCounts } from '@/modules/nav/nav.actions';
import { logoutAction } from '@/app/(staff)/actions';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { PINNED, visibleGroups, phoneTabs, isActivePath, type NavItem } from './nav.config';

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Navigation on a phone: four tabs at the bottom and "More" for the rest.
 *
 * The desktop sidebar used to stay on screen at every width as a 68px icon
 * strip. On a phone that ate a fifth of the screen and pushed pages into
 * sideways scrolling. The bottom bar sits where a thumb reaches; the sheet
 * holds everything else, plus the account, theme, language and sign-out
 * controls the top bar has no room for at this size.
 */
export function MobileNav({
  permissions, userName, role,
}: { permissions: string[]; userName: string; role: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<NavCounts>({ critical: 0, notifiable: 0, ready: 0 });

  const tabs = phoneTabs(permissions);
  const groups = visibleGroups(permissions);

  useEffect(() => {
    const load = () => getNavCountsAction().then(setCounts).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [pathname]);

  // Arriving at a page closes the sheet that took you there.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open]);

  // A count on a page that has no tab of its own must still be visible.
  const hiddenAlert = groups
    .flatMap((g) => g.items)
    .some((i) => i.badge && counts[i.badge] > 0 && !tabs.some((tab) => tab.href === i.href));
  const onTab = tabs.some((i) => isActivePath(pathname, i.href));

  return (
    <>
      <nav
        aria-label={t('nav.menu')}
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div
          className="mx-auto grid max-w-lg"
          style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
        >
          {tabs.map((item) => (
            <TabLink key={item.href} item={item} active={isActivePath(pathname, item.href)} counts={counts} />
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={tabClass(!onTab)}
          >
            <span className="relative">
              <Menu className="h-5 w-5" />
              {hiddenAlert && <span aria-hidden className="absolute -end-1 -top-0.5 h-2 w-2 rounded-full bg-red-500" />}
            </span>
            <span className="max-w-full truncate text-[11px] font-semibold">{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] animate-fade-in-up overflow-y-auto rounded-t-3xl bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="sticky top-0 z-10 bg-surface/95 px-5 pb-2 pt-2.5 backdrop-blur">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-strong">{t('nav.menu')}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('common.close')}
                  className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-strong"
                  autoFocus
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-3">
              <Link
                href="/account"
                className="mb-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-line"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500/12 text-sm font-bold text-brand-600 ring-1 ring-brand-500/25 dark:text-brand-300">
                  {initials(userName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-strong">{userName}</span>
                  <span className="block truncate text-xs text-muted">{role} · {t('nav.account')}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-subtle rtl:rotate-180" />
              </Link>

              <SheetLink item={PINNED} active={isActivePath(pathname, PINNED.href)} counts={counts} />
              {groups.map((g) => (
                <div key={g.labelKey} className="mt-3">
                  <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
                    {t(g.labelKey)}
                  </div>
                  {g.items.map((item) => (
                    <SheetLink key={item.href} item={item} active={isActivePath(pathname, item.href)} counts={counts} />
                  ))}
                </div>
              ))}

              <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2 ring-1 ring-line">
                <span className="text-xs font-semibold text-muted">{t('nav.display')}</span>
                <span className="flex items-center gap-1">
                  <ThemeToggle />
                  <LanguageToggle tone="light" />
                </span>
              </div>

              <form action={logoutAction} className="mt-3">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-danger-line hover:bg-danger-soft hover:text-danger-text"
                >
                  <LogOut className="h-4 w-4" /> {t('action.logout')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function tabClass(active: boolean) {
  return cn(
    'flex min-w-0 flex-col items-center justify-center gap-1 px-1 pb-2 pt-2.5 transition-colors',
    active ? 'text-brand-600 dark:text-brand-300' : 'text-subtle hover:text-body',
  );
}

function TabLink({ item, active, counts }: { item: NavItem; active: boolean; counts: NavCounts }) {
  const { t } = useI18n();
  const Icon = item.icon;
  const count = item.badge ? counts[item.badge] : 0;
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
      <span className="relative">
        <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
        {count > 0 && (
          <span
            aria-hidden
            className={cn('absolute -end-1 -top-0.5 h-2 w-2 rounded-full', item.urgent ? 'bg-red-500' : 'bg-amber-500')}
          />
        )}
      </span>
      <span className="max-w-full truncate text-[11px] font-semibold">{t(SHORT[item.key] ?? item.key)}</span>
    </Link>
  );
}

/** Tab-bar labels have a fifth of a phone's width; longer names get a short form here only. */
const SHORT: Record<string, string> = {
  'nav.newBooking': 'nav.short.newBooking',
  'nav.familyCards': 'nav.short.familyCards',
  'nav.critical': 'nav.short.critical',
};

function SheetLink({ item, active, counts }: { item: NavItem; active: boolean; counts: NavCounts }) {
  const { t } = useI18n();
  const Icon = item.icon;
  const count = item.badge ? counts[item.badge] : 0;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors',
        active ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-body hover:bg-surface-2',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-brand-600 dark:text-brand-400' : 'text-subtle')} />
      <span className="min-w-0 flex-1 truncate">{t(item.key)}</span>
      {count > 0 && (
        <span className={cn('min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums',
          item.urgent ? 'bg-danger-soft text-danger-text' : 'bg-warn-soft text-warn-text')}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
