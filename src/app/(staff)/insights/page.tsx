import { can } from '@/core/rbac/guard';
import { getDashboardAction } from '@/modules/insights/insights.actions';
import { InsightsClient } from './InsightsClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  if (!(await can('insights.view'))) {
    return <AccessDenied area="insights" />;
  }
  const data = await getDashboardAction();
  return <InsightsClient data={data} />;
}
