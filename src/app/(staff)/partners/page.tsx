import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listPartnersAction } from '@/modules/partners/partners.actions';
import { listRateGroupsAction } from '@/modules/pricing/pricing.actions';
import { PartnersClient } from './PartnersClient';

export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
  const [manage, view] = await Promise.all([can('partner.manage'), can('finance.view')]);
  if (!manage && !view) return <AccessDenied area="finance" />;
  const [partners, groups] = await Promise.all([listPartnersAction(), listRateGroupsAction()]);
  return <PartnersClient initial={partners} rateGroups={groups.map((g) => ({ id: g.id, name: g.name }))} canManage={manage} />;
}
