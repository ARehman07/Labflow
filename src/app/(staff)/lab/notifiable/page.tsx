import { can } from '@/core/rbac/guard';
import { NotifiableClient } from './NotifiableClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function NotifiablePage() {
  if (!(await can('notifiable.manage'))) {
    return (
      <AccessDenied area="notifiable" />
    );
  }
  return <NotifiableClient />;
}
