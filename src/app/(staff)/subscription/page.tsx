import { currentUser } from '@/core/rbac/guard';
import { unscopedPrisma } from '@/core/db/tenant';
import { labAccessFor } from '@/core/billing/access.server';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { SubscriptionClient } from './SubscriptionClient';

export const dynamic = 'force-dynamic';

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : null);

/** The owner's view of their LabFlow subscription. Reachable while read-only, since that is when it matters. */
export default async function SubscriptionPage() {
  const user = await currentUser();
  if (!(user.permissions ?? []).includes('settings.manage')) return <AccessDenied area="admin" />;
  const [lab, access, activeStaff] = await Promise.all([
    unscopedPrisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: {
        planName: true, monthlyFee: true, paidUntil: true, graceDays: true, maxUsers: true,
        labPayments: { orderBy: { paidAt: 'desc' }, take: 24 },
      },
    }),
    labAccessFor(user.tenantId),
    unscopedPrisma.user.count({ where: { tenantId: user.tenantId, isActive: true, partnerLabId: null, doctorId: null } }),
  ]);
  return (
    <SubscriptionClient
      data={{
        planName: lab.planName, monthlyFee: Number(lab.monthlyFee), paidUntil: day(lab.paidUntil), graceDays: lab.graceDays,
        maxUsers: lab.maxUsers, activeStaff, level: access.level, restrictsOn: day(access.restrictsOn),
        payments: lab.labPayments.map((p) => ({
          id: p.id, paidAt: day(p.paidAt) ?? '', months: p.months, amount: Number(p.amount),
          period: `${day(p.periodFrom)} – ${day(p.periodTo)}`, method: p.method, reference: p.reference,
        })),
      }}
    />
  );
}
