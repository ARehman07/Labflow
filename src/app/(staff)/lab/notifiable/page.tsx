import { can } from '@/core/rbac/guard';
import { NotifiableClient } from './NotifiableClient';

export default async function NotifiablePage() {
  if (!(await can('notifiable.manage'))) {
    return (
      <p className="rounded-lg bg-warn-soft p-4 text-warn-text">
        You do not have permission to handle notifiable disease reports.
      </p>
    );
  }
  return <NotifiableClient />;
}
