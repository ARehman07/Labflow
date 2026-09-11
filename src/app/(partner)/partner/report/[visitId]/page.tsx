import { notFound } from 'next/navigation';
import { partnerReportAction } from '@/modules/partners/portal.actions';
import { PortalReport } from '@/components/portal/PortalReport';

export const dynamic = 'force-dynamic';

export default async function PartnerReportPage({ params }: { params: { visitId: string } }) {
  const data = await partnerReportAction(params.visitId);
  if (!data) notFound();
  return <PortalReport data={data} back="/partner" />;
}
