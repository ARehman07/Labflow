import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listPortalLoginsAction, listPartnersAction } from '@/modules/partners/partners.actions';
import { listDoctorsAction } from '@/modules/admin/admin.actions';
import { PortalLoginsClient } from './PortalLoginsClient';

export const dynamic = 'force-dynamic';

export default async function PortalLoginsPage() {
  if (!(await can('user.manage'))) return <AccessDenied area="admin" />;
  const [logins, partners, doctors] = await Promise.all([
    listPortalLoginsAction(),
    (await can('partner.manage')) || (await can('finance.view')) ? listPartnersAction() : Promise.resolve([]),
    (await can('admin.manage')) ? listDoctorsAction() : Promise.resolve([]),
  ]);
  return (
    <PortalLoginsClient
      initial={logins}
      partners={partners.filter((p) => p.direction === 'INWARD').map((p) => ({ id: p.id, name: p.name }))}
      doctors={doctors.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
