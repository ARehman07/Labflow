import { redirect } from 'next/navigation';
import { auth } from '@/core/auth/auth';
import { needsPasswordChangeAction } from '@/modules/account/account.actions';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { NavProgress } from '@/components/layout/NavProgress';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // An owner-issued password is a handover, not a credential. Nothing else in
  // the app is reachable until the person has chosen their own.
  if (await needsPasswordChangeAction()) redirect('/set-password');

  const { name, role, branchName, permissions } = session.user;

  return (
    <div className="min-h-screen">
      <NavProgress />
      <Topbar userName={name ?? 'User'} role={role} branchName={branchName} />
      <div className="flex">
        <Sidebar permissions={permissions ?? []} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div key="page" className="mx-auto max-w-6xl animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
