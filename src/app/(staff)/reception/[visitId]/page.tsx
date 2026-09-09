import { notFound } from 'next/navigation';
import { receptionService } from '@/modules/reception/reception.service';
import { SlipView, type SlipData } from './SlipView';

export default async function SlipPage({ params }: { params: { visitId: string } }) {
  const visit = await receptionService.getSlip(params.visitId);
  if (!visit || !visit.invoice) notFound();

  const data: SlipData = {
    letterhead: {
      labName: visit.branch.tenant.name,
      tagline: visit.branch.tenant.tagline,
      logoDataUrl: visit.branch.tenant.logoDataUrl,
      licenseNo: visit.branch.tenant.licenseNo,
      email: visit.branch.tenant.email,
      footerNote: null,
      branchName: visit.branch.name,
      branchAddress: visit.branch.address,
      branchPhone: visit.branch.phone,
    },
    branchName: visit.branch.name,
    slipNo: visit.slipNo,
    bookedAt: new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(visit.bookedAt),
    patientName: visit.patient.fullName,
    mrNo: visit.patient.mrNo,
    age: visit.patient.age,
    sex: visit.patient.sex,
    mobile: visit.patient.mobile,
    doctorName: visit.doctor?.name ?? null,
    tests: visit.orderLines.map((l) => ({ name: l.test.name })),
    gross: Number(visit.invoice.grossAmount),
    discount: Number(visit.invoice.discount),
    cardFee: Number(visit.invoice.familyCardFee ?? 0),
    net: Number(visit.invoice.netAmount),
  };

  return <SlipView data={data} />;
}
