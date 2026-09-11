import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listPaymentAccountsAction } from '@/modules/accounts/accounts.actions';
import { AccountsClient } from './AccountsClient';

export default async function PaymentAccountsPage() {
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  const accounts = await listPaymentAccountsAction(true);
  return <AccountsClient initial={accounts} />;
}
