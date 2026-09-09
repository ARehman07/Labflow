import { auth } from '@/core/auth/auth';
import { can } from '@/core/rbac/guard';
import { getDashboardAction } from '@/modules/insights/insights.actions';
import { DashboardClient } from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  const canInsights = await can('insights.view');
  const data = canInsights ? await getDashboardAction() : null;
  // Staff without dashboard figures still need somewhere to go, so the page
  // falls back to their own work rather than to an empty screen.
  const permissions = session?.user?.permissions ?? [];
  return (
    <DashboardClient
      userName={session?.user?.name ?? 'User'}
      data={data}
      permissions={permissions}
    />
  );
}
