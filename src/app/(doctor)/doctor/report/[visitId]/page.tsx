import { notFound } from 'next/navigation';
import { doctorReportAction } from '@/modules/partners/portal.actions';
import { PortalReport } from '@/components/portal/PortalReport';

export const dynamic = 'force-dynamic';

export default async function DoctorReportPage({ params }: { params: { visitId: string } }) {
  const data = await doctorReportAction(params.visitId);
  if (!data) notFound();
  return <PortalReport data={data} back="/doctor" />;
}
