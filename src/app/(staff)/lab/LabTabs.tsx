'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, BellRing, FlaskConical, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';

const TABS: { href: string; key: string; icon: LucideIcon; needs: string[] }[] = [
  { href: '/lab', key: 'nav.lab', icon: FlaskConical, needs: ['sample.collect', 'result.enter', 'result.approve', 'workflow.advance'] },
  { href: '/lab/approvals', key: 'lab.approvals', icon: ShieldCheck, needs: ['result.approve'] },
  { href: '/lab/critical', key: 'nav.critical', icon: AlertTriangle, needs: ['critical.manage'] },
  { href: '/lab/notifiable', key: 'nav.notifiable', icon: BellRing, needs: ['notifiable.manage'] },
];

/**
 * The lab's four worklists, one tap apart.
 *
 * They were separate destinations reached from different places — Approvals
 * from a button on the board, Critical and Notifiable from the sidebar — so
 * moving between them meant going back out to the menu. The strip lists only
 * the ones this person can open, and disappears when that is just one.
 */
export function LabTabs({ permissions }: { permissions: string[] }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => tab.needs.some((p) => permissions.includes(p)));
  if (tabs.length < 2) return null;

  return (
    <nav aria-label={t('nav.lab')} className="no-print -mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-brand-500/10 text-brand-700 ring-1 ring-brand-500/25 dark:text-brand-300'
                    : 'text-muted hover:bg-surface-2 hover:text-strong',
                )}
              >
                <tab.icon className="h-4 w-4" /> {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
