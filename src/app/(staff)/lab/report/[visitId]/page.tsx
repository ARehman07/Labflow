import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { getReportData } from '@/modules/reporting/reporting.service';
import { ReportDocument } from '@/components/report/ReportDocument';

export default async function StaffReportPage({ params }: { params: { visitId: string } }) {
  const allowed = (await can('report.print')) || (await can('result.enter')) || (await can('result.approve'));
  if (!allowed) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have permission to view reports.</p>;
  }
  const data = await getReportData(params.visitId);
  if (!data) notFound();
  return <ReportDocument data={data} />;
}
