import { redirect } from 'next/navigation';
import { auth } from '@/core/auth/auth';
import { needsPasswordChangeAction } from '@/modules/account/account.actions';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { DoctorNav } from './DoctorNav';

export const dynamic = 'force-dynamic';

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.doctorId) redirect('/dashboard');
  if (await needsPasswordChangeAction()) redirect('/set-password');
  const db = await tenantDb();
  const [tenant, doctor] = await Promise.all([
    db.tenant.findUnique({ where: { id: await currentTenantId() }, select: { name: true } }),
    db.doctor.findUnique({ where: { id: session.user.doctorId }, select: { name: true } }),
  ]);
  return <DoctorNav labName={tenant?.name ?? ''} doctorName={doctor?.name ?? ''}>{children}</DoctorNav>;
}
