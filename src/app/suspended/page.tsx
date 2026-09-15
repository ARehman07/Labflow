import { signOut } from '@/core/auth/auth';

export const metadata = { title: 'Lab suspended — LabFlow' };

/** Where anyone still signed in to a suspended lab lands. */
export default function SuspendedPage() {
  async function signOutNow() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-xl font-extrabold text-strong">This lab’s LabFlow account is suspended</h1>
        <p className="mt-2 text-sm text-muted">Nobody at this lab can use LabFlow right now. The lab owner can contact LabFlow support to have it reactivated.</p>
        <form action={signOutNow} className="mt-6">
          <button type="submit" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">Sign out</button>
        </form>
      </div>
    </div>
  );
}
