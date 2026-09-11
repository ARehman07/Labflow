import { redirect } from 'next/navigation';
import { auth } from '@/core/auth/auth';
import { needsPasswordChangeAction } from '@/modules/account/account.actions';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { GlobalShortcuts } from '@/components/layout/GlobalShortcuts';
import { NavProgress } from '@/components/layout/NavProgress';
import { MobileNav } from '@/components/layout/MobileNav';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // An owner-issued password is a handover, not a credential. Nothing else in
  // the app is reachable until the person has chosen their own.
  if (await needsPasswordChangeAction()) redirect('/set-password');

  // Partner labs and referring doctors sign in to their own portals, never the staff app.
  if (session.user.partnerLabId) redirect('/partner');
  if (session.user.doctorId) redirect('/doctor');

  const { name, role, branchName, permissions } = session.user;

  return (
    <div className="min-h-screen">
      <NavProgress />
      <Topbar userName={name ?? 'User'} role={role} branchName={branchName} canSearch={(permissions ?? []).includes('visit.create')} />
      <GlobalShortcuts permissions={permissions ?? []} />
      <div className="flex">
        <Sidebar permissions={permissions ?? []} />
        {/* Bottom padding on phones keeps the last row clear of the tab bar. */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-6 lg:px-8">
          <div key="page" className="page-shell animate-fade-in-up">{children}</div>
        </main>
      </div>
      <MobileNav permissions={permissions ?? []} userName={name ?? 'User'} role={role} />
    </div>
  );
}
