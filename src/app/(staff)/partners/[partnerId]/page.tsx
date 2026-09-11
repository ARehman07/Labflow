import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { getPartnerAction } from '@/modules/partners/partners.actions';
import { listPaymentAccountsAction } from '@/modules/accounts/accounts.actions';
import { PartnerDetailClient } from './PartnerDetailClient';

export const dynamic = 'force-dynamic';

export default async function PartnerDetailPage({ params }: { params: { partnerId: string } }) {
  const [manage, view] = await Promise.all([can('partner.manage'), can('finance.view')]);
  if (!manage && !view) return <AccessDenied area="finance" />;
  const partner = await getPartnerAction(params.partnerId);
  if (!partner) notFound();
  const accounts = manage ? await listPaymentAccountsAction() : [];
  return <PartnerDetailClient partner={partner} accounts={accounts} canManage={manage} />;
}
