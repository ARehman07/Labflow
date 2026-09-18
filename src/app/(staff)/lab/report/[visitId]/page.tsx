import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { getReportData } from '@/modules/reporting/reporting.service';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { StaffReport } from './StaffReport';
import { messagesService } from '@/modules/messages/messages.service';
import { reportHold } from '@/modules/billing/report-hold';

export const dynamic = 'force-dynamic';

export default async function StaffReportPage({ params }: { params: { visitId: string } }) {
  const allowed = (await can('report.print')) || (await can('result.enter')) || (await can('result.approve'));
  if (!allowed) return <AccessDenied area="report" />;

  const data = await getReportData(params.visitId);
  if (!data) notFound();

  const db = await tenantDb();
  const [tenant, lines, visit] = await Promise.all([
    db.tenant.findUnique({ where: { id: await currentTenantId() }, select: { code: true, name: true } }),
    db.orderLine.findMany({ where: { visitId: params.visitId }, select: { status: true } }),
    // Only to show the address under Send → Email, so a missing one is seen
    // before the click rather than as an error after it.
    db.visit.findUnique({ where: { id: params.visitId }, select: { patient: { select: { email: true } } } }),
  ]);
  const wa = await messagesService.template('WHATSAPP_REPORT');
  const hold = await reportHold(params.visitId, await currentTenantId());
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const active = lines.filter((l) => l.status !== 'CANCELLED');

  return (
    <StaffReport
      visitId={params.visitId}
      data={data}
      canRelease={(await can('report.print')) || (await can('report.deliver'))}
      labName={tenant?.name ?? ''}
      portalLink={`${proto}://${host}/portal?lab=${encodeURIComponent(tenant?.code ?? '')}`}
      delivered={active.length > 0 && active.every((l) => l.status === 'DELIVERED')}
      printed={active.some((l) => l.status === 'PRINTED' || l.status === 'DELIVERED')}
      waTemplate={wa.custom ? wa.body : null}
      patientEmail={visit?.patient.email ?? null}
      hold={{
        held: hold.held,
        due: hold.due,
        invoiceId: hold.invoiceId,
        releasedReason: hold.due > 0 && hold.releasedUnpaid ? (hold.releasedUnpaid.reason ?? '') : null,
      }}
      canReleaseUnpaid={await can('report.releaseUnpaid')}
    />
  );
}
