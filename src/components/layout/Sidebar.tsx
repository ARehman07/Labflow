'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FilePlus2, CreditCard as CardIcon, Ticket,
  FlaskConical, AlertTriangle, BellRing,
  Wallet, Users2, Receipt,
  BarChart3, Settings, type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { getNavCountsAction, type NavCounts } from '@/modules/nav/nav.actions';

interface Item {
  href: string;
  key: string;
  icon: LucideIcon;
  /** Which live count to show, if any. */
  badge?: keyof NavCounts;
  /** A count here means someone must act, not merely that work exists. */
  urgent?: boolean;
  /**
   * Any one of these is enough to see the link. The server still guards every
   * page — this only stops the menu offering doors that will not open.
   */
  needs?: string[];
}
interface Group { labelKey: string; items: Item[] }

/**
 * Grouped by where the work happens, not by database module.
 *
 * A receptionist lives in the first block and never opens the second; a
 * technician is the reverse. Dashboard sits above the groups because it
 * belongs to nobody in particular.
 */
const PINNED: Item = { href: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard };

const GROUPS: Group[] = [
  {
    labelKey: 'navGroup.reception',
    items: [
      { href: '/reception', key: 'nav.newBooking', icon: FilePlus2, needs: ['visit.create'] },
      { href: '/family-cards', key: 'nav.familyCards', icon: CardIcon, needs: ['patient.manage'] },
      { href: '/queue', key: 'nav.queue', icon: Ticket, needs: ['workflow.advance', 'visit.create'] },
    ],
  },
  {
    labelKey: 'navGroup.laboratory',
    items: [
      { href: '/lab', key: 'nav.lab', icon: FlaskConical, needs: ['sample.collect', 'result.enter', 'result.approve', 'workflow.advance'] },
      { href: '/lab/critical', key: 'nav.critical', icon: AlertTriangle, badge: 'critical', urgent: true, needs: ['critical.manage'] },
      { href: '/lab/notifiable', key: 'nav.notifiable', icon: BellRing, badge: 'notifiable', needs: ['notifiable.manage'] },
    ],
  },
  {
    labelKey: 'navGroup.money',
    items: [
      { href: '/billing', key: 'nav.billing', icon: Receipt, needs: ['billing.view'] },
      { href: '/finance', key: 'nav.finance', icon: Wallet, needs: ['finance.view'] },
      { href: '/referral', key: 'nav.referral', icon: Users2, needs: ['finance.view'] },
    ],
  },
  {
    labelKey: 'navGroup.management',
    items: [
      { href: '/insights', key: 'nav.insights', icon: BarChart3, needs: ['insights.view'] },
      { href: '/admin', key: 'nav.admin', icon: Settings, needs: ['admin.manage', 'user.manage', 'settings.manage'] },
    ],
  },
];

export function Sidebar({ permissions }: { permissions: string[] }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>({ critical: 0, notifiable: 0 });

  // Hide what this person cannot open. A menu full of doors that answer
  // "no access" teaches staff to ignore the menu.
  const allowed = (item: Item) => !item.needs || item.needs.some((p) => permissions.includes(p));
  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    const load = () => getNavCountsAction().then(setCounts).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [pathname]);

  /** `/lab` must not light up while you are on `/lab/critical`. */
  const isActive = (href: string) =>
    pathname === href || (href !== '/lab' && pathname.startsWith(href + '/'));

  return (
    <aside className="no-print sticky top-[66px] z-20 flex h-[calc(100vh-66px)] w-[68px] shrink-0 flex-col overflow-y-auto border-e border-line bg-surface py-4 lg:w-[236px]">
      <div className="px-2.5 lg:px-3">
        <NavLink item={PINNED} active={isActive(PINNED.href)} counts={counts} />
      </div>

      {groups.map((group, gi) => (
        <div key={group.labelKey} className="mt-5 px-2.5 lg:px-3">
          {/*
            A section label, not a control. Small, letterspaced and muted, with
            a hairline that runs to the edge — so it reads as a divider caption
            rather than a tab you could click.
          */}
          <div className="mb-1.5 hidden items-center gap-2 px-2 lg:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
              {t(group.labelKey)}
            </span>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>
          {/* Narrow rail has no room for captions; a rule keeps the grouping. */}
          {gi > 0 && <div className="mx-2 mb-2 h-px bg-line lg:hidden" aria-hidden />}

          <nav className="flex flex-col gap-0.5" aria-label={t(group.labelKey)}>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                counts={counts}
              />
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}

function NavLink({ item, active, counts }: { item: Item; active: boolean; counts: NavCounts }) {
  const { t } = useI18n();
  const Icon = item.icon;
  const count = item.badge ? counts[item.badge] : 0;

  return (
    <Link
      href={item.href}
      title={t(item.key)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors',
        active
          ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
          : 'text-muted hover:bg-surface-2 hover:text-strong',
      )}
    >
      {/* A rail marks the current page. Quieter than a filled block, and it
          survives both themes without fighting the brand colour. */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-1.5 start-0 w-[3px] rounded-full transition-opacity',
          active ? 'bg-brand-600 opacity-100 dark:bg-brand-400' : 'opacity-0',
        )}
      />
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0',
          active ? 'text-brand-600 dark:text-brand-400' : 'text-subtle group-hover:text-body',
        )}
        strokeWidth={2}
      />
      <span className="hidden truncate lg:inline">{t(item.key)}</span>

      {count > 0 && (
        <span
          className={cn(
            'ms-auto hidden min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums lg:inline',
            item.urgent
              ? 'bg-danger-soft text-danger-text'
              : 'bg-warn-soft text-warn-text',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
      {/* On the icon rail the number will not fit — a dot still says "look". */}
      {count > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute end-1.5 top-1.5 h-2 w-2 rounded-full lg:hidden',
            item.urgent ? 'bg-red-500' : 'bg-amber-500',
          )}
        />
      )}
    </Link>
  );
}
