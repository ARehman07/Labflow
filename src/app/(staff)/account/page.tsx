import { getMyAccountAction } from '@/modules/account/account.actions';
import { AccountClient } from './AccountClient';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const account = await getMyAccountAction();
  return <AccountClient initial={account} />;
}
