'use client';

import Link from 'next/link';
import {
  FlaskConical, KeyRound, Layers, MapPin, MapPinned, Package, Pill, Scale, ShieldCheck, Stamp, Stethoscope, Tags, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Admin, grouped by the kind of decision being made: "add a test" and "set the
 * family-card discount" are different acts held by different people, so
 * Policy sits apart.
 *
 * Each tile's icon now shows what the page is. They were borrowed from
 * elsewhere — Users was a gear, Roles and Doctors shared the same tick,
 * Departments was a chart, and Branches and Policy were both a card.
 */
export function AdminHome({ manage, users, settings }: { manage: boolean; users: boolean; settings: boolean }) {
  const { t } = useI18n();

  return (
    <div className="page">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />

      {settings && (
        <Group title={t('admin.groupPolicy')}>
          <Tile href="/admin/policy" icon={Scale} titleKey="admin.policy" descKey="admin.policyDesc" />
          <Tile href="/admin/letterhead" icon={Stamp} titleKey="admin.letterhead" descKey="admin.letterheadDesc" />
        </Group>
      )}

      {(users || manage) && (
        <Group title={t('admin.groupPeople')}>
          {users && <Tile href="/admin/users" icon={Users} titleKey="admin.users" descKey="admin.usersDesc" />}
          {users && <Tile href="/admin/roles" icon={ShieldCheck} titleKey="admin.roles" descKey="admin.rolesDesc" />}
          {users && <Tile href="/admin/portal-logins" icon={KeyRound} titleKey="admin.portalLogins" descKey="admin.portalLoginsDesc" />}
          {manage && <Tile href="/admin/doctors" icon={Stethoscope} titleKey="admin.doctors" descKey="admin.doctorsDesc" />}
          {manage && <Tile href="/admin/accounts" icon={Wallet} titleKey="admin.accounts" descKey="admin.accountsDesc" />}
        </Group>
      )}

      {manage && (
        <Group title={t('admin.groupCatalogue')}>
          <Tile href="/admin/tests" icon={FlaskConical} titleKey="admin.tests" descKey="admin.testsDesc" />
          <Tile href="/admin/packages" icon={Package} titleKey="admin.packages" descKey="admin.packagesDesc" />
          <Tile href="/admin/antibiotics" icon={Pill} titleKey="admin.antibiotics" descKey="admin.antibioticsDesc" />
          <Tile href="/admin/rate-groups" icon={Tags} titleKey="admin.rateGroups" descKey="admin.rateGroupsDesc" />
          <Tile href="/admin/collection-points" icon={MapPinned} titleKey="admin.collectionPoints" descKey="admin.collectionPointsDesc" />
          <Tile href="/admin/departments" icon={Layers} titleKey="admin.departments" descKey="admin.departmentsDesc" />
          <Tile href="/admin/branches" icon={MapPin} titleKey="admin.branches" descKey="admin.branchesDesc" />
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="section-title mb-2">{title}</h2>
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Tile({ href, icon: Icon, titleKey, descKey }: { href: string; icon: LucideIcon; titleKey: string; descKey: string }) {
  const { t } = useI18n();
  return (
    <Link href={href} className="group card card-hover flex items-start gap-3 p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition-colors group-hover:bg-brand-500/20 dark:text-brand-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-body">{t(titleKey)}</span>
        <span className="block text-sm text-muted">{t(descKey)}</span>
      </span>
    </Link>
  );
}
