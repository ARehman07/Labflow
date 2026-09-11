import { headers } from 'next/headers';
import { can } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { getReadyReportsAction } from '@/modules/lab/lab.actions';
import { ReadyClient } from './ReadyClient';

export const dynamic = 'force-dynamic';

export default async function ReadyReportsPage() {
  const allowed = (await can('report.print')) || (await can('report.deliver'));
  if (!allowed) return <AccessDenied area="report" />;

  const [initial, tenant] = await Promise.all([
    getReadyReportsAction(),
    (await tenantDb()).tenant.findUnique({ where: { id: await currentTenantId() }, select: { code: true, name: true } }),
  ]);
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  return (
    <ReadyClient
      initial={initial}
      labName={tenant?.name ?? ''}
      portalLink={`${proto}://${host}/portal?lab=${encodeURIComponent(tenant?.code ?? '')}`}
    />
  );
}
