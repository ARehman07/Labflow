import { can } from '@/core/rbac/guard';
import { getDashboardAction } from '@/modules/insights/insights.actions';
import { InsightsClient } from './InsightsClient';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  if (!(await can('insights.view'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have access to insights.</p>;
  }
  const data = await getDashboardAction();
  return <InsightsClient data={data} />;
}
