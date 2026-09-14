import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { reportOptionsAction } from '@/modules/reports/reports.actions';
import { ReportsClient } from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const [finance, insights, approve, print] = await Promise.all([can('finance.view'), can('insights.view'), can('result.approve'), can('report.print')]);
  if (!finance && !insights && !approve && !print) return <AccessDenied area="insights" />;
  return <ReportsClient options={await reportOptionsAction()} money={finance || insights} results={approve || print || insights} />;
}
