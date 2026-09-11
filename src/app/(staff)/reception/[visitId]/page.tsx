import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { receptionService } from '@/modules/reception/reception.service';
import { priceTests } from '@/modules/catalog/catalog.service';
import { can } from '@/core/rbac/guard';
import { SlipView, type SlipData } from './SlipView';

export default async function SlipPage({ params }: { params: { visitId: string } }) {
  const visit = await receptionService.getSlip(params.visitId);
  if (!visit || !visit.invoice) notFound();

  // The portal address is printed as this lab actually serves it — whatever
  // domain the counter is using — not a hard-coded one that may be wrong.
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  const active = visit.orderLines.filter((l) => l.status !== 'CANCELLED');
  const [canModify, canCancel, canCreate, prices] = await Promise.all([
    can('visit.modify'),
    can('visit.cancel'),
    can('visit.create'),
    priceTests(visit.branchId, active.map((l) => l.testId), { includeInactive: true }),
  ]);

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
    tests: active.map((l) => ({ name: l.test.name, remarks: l.bookingRemarks, packageName: l.package?.name ?? null })),
    collectionPoint: visit.collectionPoint?.name ?? null,
    rateGroup: visit.rateGroup?.name ?? null,
    sampleSource: visit.sampleSource,
    reportDue: visit.reportDueAt
      ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(visit.reportDueAt)
      : null,
    canAttach: canCreate || canModify,
    visitId: visit.id,
    notes: visit.notes ?? null,
    status: visit.status,
    lines: active.map((l) => ({
      id: l.id, testId: l.testId, name: l.test.name, status: l.status,
      price: l.price != null ? Number(l.price) : (prices.get(l.testId)?.price ?? 0),
    })),
    can: { modify: canModify, cancel: canCancel },
    gross: Number(visit.invoice.grossAmount),
    discount: Number(visit.invoice.discount),
    careOfName: visit.invoice.careOfUser?.fullName ?? null,
    discountSource: visit.invoice.discountSource,
    cardPct: visit.invoice.familyCard ? Number(visit.invoice.familyCard.discountPct) : null,
    labCode: visit.branch.tenant.code,
    tokenNumber: visit.token?.number ?? null,
    paid: Number(visit.invoice.paidAmount),
    paymentMethods: [...new Set(visit.invoice.payments.map((p) => p.method))],
    portalUrl: `${proto}://${host}/portal`,
    cardFee: Number(visit.invoice.familyCardFee ?? 0),
    net: Number(visit.invoice.netAmount),
  };

  return <SlipView data={data} />;
}
