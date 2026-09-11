import { redirect } from 'next/navigation';
import { auth } from '@/core/auth/auth';
import { needsPasswordChangeAction } from '@/modules/account/account.actions';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { PartnerNav } from './PartnerNav';

export const dynamic = 'force-dynamic';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.partnerLabId) redirect('/dashboard');
  if (await needsPasswordChangeAction()) redirect('/set-password');
  const db = await tenantDb();
  const [tenant, partner] = await Promise.all([
    db.tenant.findUnique({ where: { id: await currentTenantId() }, select: { name: true } }),
    db.partnerLab.findUnique({ where: { id: session.user.partnerLabId }, select: { name: true } }),
  ]);
  return <PartnerNav labName={tenant?.name ?? ''} partnerName={partner?.name ?? ''}>{children}</PartnerNav>;
}
