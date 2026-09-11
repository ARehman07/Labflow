import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { AdminHome } from './AdminHome';

export default async function AdminPage() {
  const [manage, users, settings] = await Promise.all([
    can('admin.manage'), can('user.manage'), can('settings.manage'),
  ]);
  if (!manage && !users && !settings) return <AccessDenied area="admin" />;
  return <AdminHome manage={manage} users={users} settings={settings} />;
}
