import { redirect } from 'next/navigation';
import { auth } from '@/core/auth/auth';
import { needsPasswordChangeAction } from '@/modules/account/account.actions';
import { SetPasswordClient } from './SetPasswordClient';

export const dynamic = 'force-dynamic';

/**
 * Deliberately outside the (staff) layout: that layout redirects here, so
 * rendering inside it would loop. It also means no sidebar — there is exactly
 * one thing to do on this screen.
 */
export default async function SetPasswordPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!(await needsPasswordChangeAction())) redirect('/dashboard');
  return <SetPasswordClient name={session.user.name ?? session.user.username} />;
}
