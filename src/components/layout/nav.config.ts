import {
  LayoutDashboard, FilePlus2, FileText, CreditCard as CardIcon, Ticket,
  FlaskConical, AlertTriangle, BellRing, ClipboardCheck,
  Wallet, Users2, Receipt,
  BarChart3, Settings, PackageCheck, Building2, FileSpreadsheet, ShieldCheck, Boxes, type LucideIcon,
} from 'lucide-react';
import type { NavCounts } from '@/modules/nav/nav.actions';
import { ALL_FEATURES_ON, type FeatureKey, type Features } from '@/core/features/catalog';

export interface NavItem {
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
  /** Hidden when the lab has switched this part off. */
  feature?: FeatureKey;
}
export interface NavGroup { labelKey: string; items: NavItem[] }

/**
 * Grouped by where the work happens, not by database module.
 *
 * A receptionist lives in the first block and never opens the second; a
 * technician is the reverse. Dashboard sits above the groups because it
 * belongs to nobody in particular.
 */
export const PINNED: NavItem = { href: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard };

export const GROUPS: NavGroup[] = [
  {
    labelKey: 'navGroup.reception',
    items: [
      { href: '/reception', key: 'nav.newBooking', icon: FilePlus2, needs: ['visit.create'] },
      { href: '/family-cards', key: 'nav.familyCards', icon: CardIcon, needs: ['patient.manage'], feature: 'booking.familyCards' },
      { href: '/queue', key: 'nav.queue', icon: Ticket, needs: ['workflow.advance', 'visit.create'], feature: 'lab.queue' },
      { href: '/reception/ready', key: 'nav.readyReports', icon: PackageCheck, badge: 'ready', needs: ['report.print', 'report.deliver'] },
      { href: '/documents', key: 'nav.documents', icon: FileText, needs: ['document.manage'], feature: 'patients.documents' },
    ],
  },
  {
    labelKey: 'navGroup.laboratory',
    items: [
      { href: '/lab', key: 'nav.lab', icon: FlaskConical, needs: ['sample.collect', 'result.enter', 'result.approve', 'workflow.advance'] },
      // The pathologist's whole job. It used to exist only as a tab inside /lab.
      { href: '/lab/approvals', key: 'lab.approvals', icon: ClipboardCheck, badge: 'approvals', urgent: true, needs: ['result.approve'] },
      { href: '/lab/critical', key: 'nav.critical', icon: AlertTriangle, badge: 'critical', urgent: true, needs: ['critical.manage'], feature: 'lab.critical' },
      { href: '/lab/notifiable', key: 'nav.notifiable', icon: BellRing, badge: 'notifiable', needs: ['notifiable.manage'], feature: 'lab.notifiable' },
      { href: '/lab/qc', key: 'nav.qc', icon: ShieldCheck, needs: ['qc.manage', 'result.enter', 'result.approve'], feature: 'lab.qc' },
      { href: '/lab/stock', key: 'nav.stock', icon: Boxes, needs: ['stock.manage'], feature: 'lab.stock' },
    ],
  },
  {
    labelKey: 'navGroup.money',
    items: [
      { href: '/billing', key: 'nav.billing', icon: Receipt, needs: ['billing.view'] },
      { href: '/finance', key: 'nav.finance', icon: Wallet, needs: ['finance.view'] },
      { href: '/referral', key: 'nav.referral', icon: Users2, needs: ['finance.view'], feature: 'money.referrals' },
      { href: '/partners', key: 'nav.partners', icon: Building2, needs: ['partner.manage', 'finance.view'], feature: 'booking.b2b' },
    ],
  },
  {
    labelKey: 'navGroup.management',
    items: [
      { href: '/insights', key: 'nav.insights', icon: BarChart3, needs: ['insights.view'] },
      { href: '/reports', key: 'nav.reports', icon: FileSpreadsheet, needs: ['finance.view', 'insights.view', 'result.approve', 'report.print'] },
      { href: '/admin', key: 'nav.admin', icon: Settings, needs: ['admin.manage', 'user.manage', 'settings.manage'] },
    ],
  },
];

/**
 * The phone tab bar's four slots, in order of how often the counter uses them.
 * Anything this person cannot open is skipped and the next allowed page fills
 * the slot, so every role gets four useful tabs.
 */
const PHONE_PREFERENCE = ['/dashboard', '/reception', '/lab', '/lab/approvals', '/billing', '/queue', '/family-cards', '/lab/critical', '/insights'];

export function visibleGroups(permissions: string[], features: Features = ALL_FEATURES_ON): NavGroup[] {
  const allowed = (item: NavItem) =>
    (!item.feature || features[item.feature]) && (!item.needs || item.needs.some((p) => permissions.includes(p)));
  return GROUPS
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);
}

export function phoneTabs(permissions: string[], features: Features = ALL_FEATURES_ON): NavItem[] {
  const all = [PINNED, ...visibleGroups(permissions, features).flatMap((g) => g.items)];
  return PHONE_PREFERENCE
    .map((href) => all.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i)
    .slice(0, 4);
}

/** `/lab` must not light up while you are on `/lab/critical`. */
export function isActivePath(pathname: string, href: string): boolean {
  // Section roots whose sub-pages have their own menu items must not light up
  // alongside them: /lab under /lab/critical, /reception under /reception/ready.
  if (href === '/lab' || href === '/reception') return pathname === href || (href === '/reception' && /^\/reception\/(?!ready)/.test(pathname));
  return pathname === href || pathname.startsWith(href + '/');
}
